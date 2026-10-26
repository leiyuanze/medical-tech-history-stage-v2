(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const transitionCanvas = $("transition");
  const ctx = transitionCanvas.getContext("2d");
  const outputMode = new URLSearchParams(location.search).has("output");

  const cues = [
    {
      id: "palace",
      media: "palace",
      order: 0,
      short: "古代中国",
      index: "第一场",
      year: "古代中国",
      place: "古代中国 · 宫廷",
      warp: "先到现代",
      knowledgeKicker: "古代中国牙科 · 齿蠹",
      knowledgeText:
        "中药熏漱、外敷与针灸可暂时止痛；牙体腐坏深时，古代缺乏修补手段，根治通常只能拔牙。",
    },
    {
      id: "clinic",
      media: "clinic",
      order: 3,
      short: "现代口腔科",
      index: "第四场",
      year: "21世纪",
      place: "现代 · 口腔科",
      warp: "去往更远的未来",
      knowledgeKicker: "完整诊疗 · 保存天然牙",
      knowledgeText:
        "局部麻醉与高温灭菌保障治疗，根管处理和树脂充填可清除感染并保留患牙。",
    },
    {
      id: "hartford",
      media: "hartford",
      order: 2,
      short: "1844 笑气实验",
      index: "第三场",
      year: "1844年",
      place: "美国哈特福德 · 笑气实验",
      warp: "再去十九世纪",
      knowledgeKicker: "近代麻醉 · 笑气实验",
      knowledgeText:
        "笑气减轻拔牙疼痛，是近代牙科麻醉的重要节点；但剂量控制、消毒与牙体修复仍不成熟。",
    },
    {
      id: "barber",
      media: "barber",
      order: 1,
      short: "1400 理发外科",
      index: "第二场",
      year: "1400年",
      place: "法国巴黎 · 理发外科铺",
      warp: "向未来游历",
      knowledgeKicker: "中世纪欧洲牙科 · 理发外科",
      knowledgeText:
        "当时没有专职牙医，理发匠兼做放血和拔牙；无麻醉、无补牙，感染风险高。",
    },
  ];

  cues.sort((left, right) => left.order - right.order);

  const videos = {
    palace: $("palace"),
    clinic: $("clinic"),
    hartford: $("hartford"),
    barber: $("barber"),
  };

  const mediaLabels = {
    palace: "宫廷",
    barber: "1400",
    hartford: "1844年",
    clinic: "现代口腔科",
  };

  let currentIndex = 0;
  let busy = false;
  let paused = false;
  let black = false;
  let knowledgeVisible = true;
  let started = false;
  let frameToken = 0;
  let momentTimer = 0;
  let hideTimer = 0;
  let finaleTimer = 0;
  let outputWindow = null;
  let suppressBroadcast = false;

  const sender = Math.random().toString(36).slice(2);
  const seen = new Set();
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("emperor-stage-v3")
      : null;

  if (outputMode) {
    document.body.classList.add("output");
  }

  function cue() {
    return cues[currentIndex];
  }

  function currentVideo() {
    return videos[cue().media];
  }

  function waitForVideo(video, timeout = 1200) {
    if (video.readyState >= 2) return Promise.resolve();
    return new Promise((resolve) => {
      let timer = 0;
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener("loadeddata", done);
        video.removeEventListener("canplay", done);
        video.removeEventListener("error", done);
        resolve();
      };
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("canplay", done, { once: true });
      video.addEventListener("error", done, { once: true });
      timer = setTimeout(done, timeout);
    });
  }

  function prepare(video) {
    video.preload = "auto";
    if (video.readyState === 0) video.load();
  }

  function renderCueUi() {
    const item = cue();
    stage.dataset.cue = item.id;
    $("state").textContent = `${item.index} · ${item.short}`;
    $("era-year").textContent = item.year;
    $("era-place").textContent = item.place;
    $("knowledge-kicker").textContent = item.knowledgeKicker;
    $("knowledge-text").textContent = item.knowledgeText;
    $("sceneSelect").value = String(currentIndex);
    $("momentButton").disabled = item.id !== "clinic";
    $("next").innerHTML =
      currentIndex === cues.length - 1
        ? "收黑 <kbd>空格</kbd>"
        : "下一景 <kbd>空格</kbd>";

    document.querySelectorAll("[data-era-node]").forEach((node) => {
      const index = Number(node.dataset.eraNode);
      node.classList.toggle("active", index === currentIndex);
      node.classList.toggle("passed", index < currentIndex);
    });
  }

  function renderControls() {
    $("pause").innerHTML = `${paused ? "继续" : "暂停"} <kbd>P</kbd>`;
    $("black").innerHTML = `${black ? "恢复" : "黑屏"} <kbd>B</kbd>`;
    $("blackout").classList.toggle("active", black);
    document.body.classList.toggle("blacked", black);
    document.querySelectorAll("button:not(#hide):not(#enterLandscape)").forEach((button) => {
      button.disabled = busy || button.id === "momentButton" && cue().id !== "clinic";
    });
  }

  function setKnowledgeVisible(value, broadcast = true) {
    knowledgeVisible = Boolean(value);
    document.body.classList.toggle("knowledge-hidden", !knowledgeVisible);
    $("knowledgeToggle").setAttribute("aria-pressed", String(knowledgeVisible));
    if (broadcast) emit("knowledge", { value: knowledgeVisible });
  }

  function showMoment() {
    if (cue().id !== "clinic") return;
    const moment = $("moment");
    moment.classList.remove("active");
    void moment.offsetWidth;
    moment.classList.add("active");
    clearTimeout(momentTimer);
    momentTimer = setTimeout(() => moment.classList.remove("active"), 3300);
  }

  function hideUI() {
    if (outputMode) return;
    document.body.classList.add("ui-hidden");
    clearTimeout(hideTimer);
    document.activeElement?.blur?.();
  }

  function showUI() {
    if (outputMode) return;
    document.body.classList.remove("ui-hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideUI, 3000);
  }

  async function begin() {
    started = true;
    $("start").hidden = true;
    const video = currentVideo();
    prepare(video);
    try {
      if (!paused) await video.play();
    } catch (error) {
      $("start").hidden = false;
    }
    renderControls();
  }

  function instantTo(index) {
    if (index < 0 || index >= cues.length) return;
    frameToken += 1;
    busy = false;
    currentIndex = index;
    transitionCanvas.style.opacity = 0;
    $("warp").classList.remove("active");
    const activeMedia = cue().media;
    Object.entries(videos).forEach(([name, video]) => {
      const visible = name === activeMedia;
      video.classList.toggle("visible", visible);
      if (!visible) video.pause();
    });
    const video = currentVideo();
    prepare(video);
    if (cue().id === "return") video.currentTime = 0;
    if (started && !paused) video.play().catch(() => {});
    renderCueUi();
    renderControls();
  }

  function fitCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const maxEdge = 2560;
    const scale = Math.min(dpr, maxEdge / Math.max(rect.width, rect.height));
    transitionCanvas.width = Math.max(1, Math.round(rect.width * scale));
    transitionCanvas.height = Math.max(1, Math.round(rect.height * scale));
  }

  function drawCover(video, zoom = 1) {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return false;
    }
    const width = transitionCanvas.width;
    const height = transitionCanvas.height;
    const scale =
      Math.max(width / video.videoWidth, height / video.videoHeight) * zoom;
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    ctx.drawImage(
      video,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    return true;
  }

  function emit(action, data = {}) {
    const message = {
      type: "emperor-stage",
      sender,
      id: `${sender}:${Date.now()}:${Math.random()}`,
      action,
      data,
    };
    channel?.postMessage(message);
    try {
      outputWindow?.postMessage(message, "*");
    } catch (error) {
      outputWindow = null;
    }
  }

  function receive(message) {
    if (
      !message ||
      message.type !== "emperor-stage" ||
      message.sender === sender ||
      seen.has(message.id)
    ) {
      return;
    }
    seen.add(message.id);
    if (seen.size > 120) seen.delete(seen.values().next().value);

    if (message.action === "hello") {
      if (!outputMode) emitCueState();
      return;
    }
    if (message.action === "cue") {
      suppressBroadcast = true;
      switchTo(Number(message.data.index), { broadcast: false });
      suppressBroadcast = false;
    }
    if (message.action === "pause") setPaused(Boolean(message.data.value), false);
    if (message.action === "black") setBlack(Boolean(message.data.value), false);
    if (message.action === "moment") showMoment();
    if (message.action === "knowledge") setKnowledgeVisible(Boolean(message.data.value), false);
  }

  if (channel) channel.onmessage = (event) => receive(event.data);
  window.addEventListener("message", (event) => {
    if (event.origin === location.origin || location.protocol === "file:") {
      receive(event.data);
    }
  });

  function emitCueState() {
    emit("cue", { index: currentIndex });
    emit("pause", { value: paused });
    emit("black", { value: black });
    emit("knowledge", { value: knowledgeVisible });
  }

  async function switchTo(targetIndex, options = {}) {
    const { broadcast = true, instant = false } = options;
    if (
      busy ||
      targetIndex === currentIndex ||
      targetIndex < 0 ||
      targetIndex >= cues.length
    ) {
      return;
    }

    if (instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      instantTo(targetIndex);
      if (broadcast) emitCueState();
      return;
    }

    busy = true;
    renderControls();
    hideUI();
    const id = ++frameToken;
    const fromVideo = currentVideo();
    const targetCue = cues[targetIndex];
    const toVideo = videos[targetCue.media];
    const sameVideo = fromVideo === toVideo;
    started = true;
    $("start").hidden = true;
    prepare(toVideo);
    if (targetCue.id === "return") toVideo.currentTime = 0;
    try {
      await toVideo.play();
    } catch (error) {
      // Autoplay can be refused until the first visible interaction.
    }
    await waitForVideo(toVideo);
    if (id !== frameToken) return;

    $("warpLabel").textContent = targetCue.warp;
    const warp = $("warp");
    warp.classList.remove("active");
    void warp.offsetWidth;
    warp.classList.add("active");
    fitCanvas();
    transitionCanvas.style.opacity = 1;
    const start = performance.now();
    const duration = sameVideo ? 1800 : 2800;

    function step(now) {
      if (id !== frameToken) return;
      const progress = Math.min(1, (now - start) / duration);
      const ease = progress * progress * (3 - 2 * progress);
      const width = transitionCanvas.width;
      const height = transitionCanvas.height;
      ctx.clearRect(0, 0, width, height);

      const drewFrom = drawCover(fromVideo, 1 + 0.018 * ease);
      if (!drewFrom) {
        ctx.fillStyle = "#050706";
        ctx.fillRect(0, 0, width, height);
      }

      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const radius =
        Math.hypot(width, height) * 0.56 * Math.pow(ease, 1.18);
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(0.1, radius), 0, Math.PI * 2);
      ctx.clip();
      if (!drawCover(toVideo, 1.025 - 0.025 * ease)) {
        ctx.fillStyle = "#050706";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();

      if (progress > 0.04 && progress < 0.97) {
        const alpha = Math.sin(Math.PI * progress);
        const ring = ctx.createRadialGradient(
          centerX,
          centerY,
          Math.max(0, radius - 26),
          centerX,
          centerY,
          radius + 52,
        );
        ring.addColorStop(0, "rgba(255,244,211,0)");
        ring.addColorStop(0.34, `rgba(255,236,193,${0.42 * alpha})`);
        ring.addColorStop(0.54, `rgba(183,228,239,${0.3 * alpha})`);
        ring.addColorStop(1, "rgba(168,213,224,0)");
        ctx.fillStyle = ring;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalAlpha = 0.24 * alpha;
        ctx.strokeStyle = "#dffaff";
        ctx.lineWidth = Math.max(1, width / 1200);
        for (let line = 0; line < 3; line += 1) {
          const y = ((now * 0.22 + line * height * 0.31) % height) - 20;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y + height * 0.018);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        currentIndex = targetIndex;
        Object.entries(videos).forEach(([name, video]) => {
          video.classList.toggle("visible", name === targetCue.media);
          if (name !== targetCue.media) video.pause();
        });
        if (paused) toVideo.pause();
        transitionCanvas.style.opacity = 0;
        warp.classList.remove("active");
        busy = false;
        renderCueUi();
        renderControls();
        if (broadcast) emitCueState();
      }
    }
    requestAnimationFrame(step);
    if (broadcast && !suppressBroadcast) emit("cue", { index: targetIndex });
  }

  function setPaused(value, broadcast = true) {
    paused = Boolean(value);
    Object.entries(videos).forEach(([name, video]) => {
      if (paused || name !== cue().media) video.pause();
    });
    if (!paused && started) currentVideo().play().catch(() => {});
    renderControls();
    if (broadcast) emit("pause", { value: paused });
  }

  function setBlack(value, broadcast = true) {
    black = Boolean(value);
    $("portal").classList.remove("active");
    clearTimeout(finaleTimer);
    renderControls();
    if (broadcast) emit("black", { value: black });
  }

  function finale() {
    if (busy) return;
    hideUI();
    clearTimeout(finaleTimer);
    finaleTimer = setTimeout(() => setBlack(true), 650);
  }

  function goNext() {
    if (busy) return;
    if (currentIndex < cues.length - 1) {
      switchTo(currentIndex + 1);
    } else {
      finale();
    }
  }

  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await stage.requestFullscreen();
      }
    } catch (error) {
      // Desktop browsers can refuse fullscreen outside a direct click.
    }
  }

  async function enterLandscapeMode() {
    const button = $("enterLandscape");
    button.disabled = true;
    await enterFullscreen();
    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch (error) {
      button.textContent = "请旋转手机";
    }
    setTimeout(() => {
      button.disabled = false;
      button.textContent = "进入全屏";
      updateViewportMode();
    }, 900);
    begin();
  }

  function updateViewportMode() {
    const needsLandscape =
      window.innerHeight > window.innerWidth * 1.04 &&
      window.innerWidth < 1200 &&
      !outputMode;
    document.body.classList.toggle("needs-landscape", needsLandscape);
    fitCanvas();
  }

  function openOutputWindow() {
    const url = new URL(location.href);
    url.searchParams.set("output", "1");
    outputWindow = window.open(
      url.toString(),
      "emperorAudience",
      "popup=yes,width=1440,height=900",
    );
  }

  $("start").addEventListener("click", () => {
    paused = false;
    begin();
  });
  $("sceneSelect").addEventListener("change", (event) => {
    switchTo(Number(event.currentTarget.value));
  });
  $("next").addEventListener("click", goNext);
  $("momentButton").addEventListener("click", () => {
    showMoment();
    emit("moment");
  });
  $("pause").addEventListener("click", () => setPaused(!paused));
  $("knowledgeToggle").addEventListener("click", () =>
    setKnowledgeVisible(!knowledgeVisible),
  );
  $("black").addEventListener("click", () => setBlack(!black));
  $("fullscreen").addEventListener("click", enterFullscreen);
  $("openOutput").addEventListener("click", openOutputWindow);
  $("hide").addEventListener("click", hideUI);
  $("enterLandscape").addEventListener("click", enterLandscapeMode);

  stage.addEventListener("pointermove", showUI);
  stage.addEventListener("pointerdown", (event) => {
    if (event.target === stage || event.target.tagName === "VIDEO") {
      showUI();
    }
  });
  stage.addEventListener("dblclick", (event) => {
    if (!event.target.closest("nav") && !event.target.closest("#portraitGate")) {
      enterFullscreen();
    }
  });
  $("hud").addEventListener("focusin", showUI);

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "arrowright" || key === "arrowleft") {
      event.preventDefault();
      if (key === "arrowleft" && currentIndex > 0) switchTo(currentIndex - 1);
      else if (key !== "arrowleft") goNext();
    } else if (/^[1-4]$/.test(key)) {
      switchTo(Number(key) - 1);
    } else if (key === "p") {
      setPaused(!paused);
    } else if (key === "b") {
      setBlack(!black);
    } else if (key === "m") {
      showMoment();
      emit("moment");
    } else if (key === "k") {
      setKnowledgeVisible(!knowledgeVisible);
    } else if (key === "f") {
      enterFullscreen();
    } else if (key === "h") {
      document.body.classList.contains("ui-hidden") ? showUI() : hideUI();
    } else if (key === "tab") {
      showUI();
    }
  });

  Object.entries(videos).forEach(([name, video]) => {
    video.addEventListener("error", () => {
      $("error").hidden = false;
      $("error").textContent = `${mediaLabels[name]}视频未加载，请检查文件`;
    });
    video.addEventListener("playing", () => {
      $("error").hidden = true;
    });
  });

  new ResizeObserver(updateViewportMode).observe(stage);
  window.addEventListener("resize", updateViewportMode);
  window.addEventListener("orientationchange", updateViewportMode);
  window.addEventListener("fullscreenchange", updateViewportMode);

  window.stageDemo = {
    get state() {
      return {
        cue: cue().id,
        index: currentIndex,
        busy,
        paused,
        black,
        started,
        uiHidden: document.body.classList.contains("ui-hidden"),
      };
    },
    switchTo,
    instantTo,
    setPaused,
    setBlack,
    setKnowledgeVisible,
    showMoment,
    finale,
    hideUI,
    showUI,
    begin,
  };

  renderCueUi();
  renderControls();
  setKnowledgeVisible(true, false);
  updateViewportMode();
  showUI();
  setTimeout(() => {
    begin();
  }, 160);
  if (outputMode) emit("hello");
})();
