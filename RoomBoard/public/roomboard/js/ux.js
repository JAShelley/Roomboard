  // Back-to-top button (shows after 25% scroll)
  (function(){
    var btn = document.getElementById("toTopBtn");
    if(!btn) return;

    function update(){
      var doc = document.documentElement;
      var scrollTop = (window.pageYOffset || doc.scrollTop || 0);
      var scrollHeight = (doc.scrollHeight || 0);
      var clientHeight = (doc.clientHeight || window.innerHeight || 0);
      var maxScroll = Math.max(1, scrollHeight - clientHeight);
      var ratio = scrollTop / maxScroll;
      if(ratio >= 0.25) btn.classList.add("show");
      else btn.classList.remove("show");
    }

    btn.addEventListener("click", function(){
      try{
        window.scrollTo({ top: 0, behavior: "smooth" });
      }catch(e){
        window.scrollTo(0,0);
      }
    });

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  })();

  (function(){
    function isExternalUrl(url){
      return /^https?:\/\//i.test(String(url || ""));
    }

    function shouldVerifyLocalDownload(url){
      return !!url && !isExternalUrl(url) && !/^file:/i.test(String(url || ""));
    }

    function revealDownloadCard(card, link, meta, url, filename){
      link.href = url;
      if(filename) link.setAttribute("download", filename);
      if(meta && filename) meta.textContent = "Direct installer: " + filename;
      card.style.display = "";
    }

    function setupDownloadCard(options){
      var card = document.getElementById(options.cardId);
      var link = document.getElementById(options.linkId);
      var meta = document.getElementById(options.metaId);
      if(!card || !link) return;

      var url = String(options.url || "").trim();
      var filename = String(options.filename || "").trim();

      if(!url){
        card.style.display = "none";
        return;
      }

      if(shouldVerifyLocalDownload(url) && window.fetch){
        fetch(url, { method: "HEAD", cache: "no-store" }).then(function(response){
          if(response && response.ok) revealDownloadCard(card, link, meta, url, filename);
          else card.style.display = "none";
        }).catch(function(){
          card.style.display = "none";
        });
        return;
      }

      revealDownloadCard(card, link, meta, url, filename);
    }

    setupDownloadCard({
      cardId: "desktopDownloadCard",
      linkId: "desktopDownloadLink",
      metaId: "desktopDownloadMeta",
      url: window.__ROOMBOARD_WINDOWS_DOWNLOAD_URL__,
      filename: window.__ROOMBOARD_WINDOWS_DOWNLOAD_FILENAME__ || "RoomBoard-Setup-Windows-x64.exe"
    });

    setupDownloadCard({
      cardId: "desktopMacDownloadCard",
      linkId: "desktopMacDownloadLink",
      metaId: "desktopMacDownloadMeta",
      url: window.__ROOMBOARD_MAC_DOWNLOAD_URL__,
      filename: window.__ROOMBOARD_MAC_DOWNLOAD_FILENAME__ || "RoomBoard-macOS.dmg"
    });

    setupDownloadCard({
      cardId: "captureDownloadCard",
      linkId: "captureDownloadLink",
      metaId: "captureDownloadMeta",
      url: window.__ROOMBOARD_CAPTURE_WINDOWS_DOWNLOAD_URL__,
      filename: window.__ROOMBOARD_CAPTURE_WINDOWS_DOWNLOAD_FILENAME__ || "RoomBoard-Capture-Setup-Windows-x64.exe"
    });

    setupDownloadCard({
      cardId: "captureMacDownloadCard",
      linkId: "captureMacDownloadLink",
      metaId: "captureMacDownloadMeta",
      url: window.__ROOMBOARD_CAPTURE_MAC_DOWNLOAD_URL__,
      filename: window.__ROOMBOARD_CAPTURE_MAC_DOWNLOAD_FILENAME__ || "RoomBoard-Capture-macOS.dmg"
    });
  })();

  function toast(message, options){
    if(!message) return;
    options = options || {};
    var host = document.getElementById("toastStack");
    if(!host){
      host = document.createElement("div");
      host.id = "toastStack";
      host.className = "toastStack";
      document.body.appendChild(host);
    }

    var card = document.createElement("div");
    card.className = "toastCard";

    var text = document.createElement("div");
    text.textContent = String(message);
    card.appendChild(text);

    if(options.actionLabel && typeof options.onAction === "function"){
      var actionBtn = document.createElement("button");
      actionBtn.className = "btn sm";
      actionBtn.type = "button";
      actionBtn.textContent = options.actionLabel;
      actionBtn.addEventListener("click", function(){
        try{ options.onAction(); }catch(e){}
        if(card.parentNode) card.parentNode.removeChild(card);
      });
      card.appendChild(actionBtn);
    }

    host.appendChild(card);

    var timeoutMs = Math.max(1800, Number(options.timeoutMs || 2600));
    setTimeout(function(){
      if(card.parentNode) card.parentNode.removeChild(card);
    }, timeoutMs);
  }
