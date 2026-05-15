/*
  app.js · Llop de Mar
  Versión estable con mar bajo la rosa de los vientos
  SIN iconos externos de Meteocat.
*/

document.addEventListener("DOMContentLoaded", () => {
  const SANT_FELIU = { lat: 41.781, lon: 3.0345 };

  let selectedSessionTime = "08:00";
  let selectedSessionDay = 1;
  let cachedWeatherData = null;
  let map = null;

  function initMap() {
    const mapElement = document.getElementById("map");
    if (!mapElement || typeof L === "undefined") return;

    const isDesktopMap = window.matchMedia("(min-width: 901px)").matches;
    const initialZoom = isDesktopMap ? 14 : 13;

    map = L.map("map", {
      scrollWheelZoom: false,
      zoomControl: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false
    }).setView([41.780, 3.034], initialZoom);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 250);
    setTimeout(() => map.invalidateSize(), 900);
  }

  function directionName(deg) {
    const directions = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return directions[Math.round(deg / 45) % 8];
  }

  function windNameCatalan(deg) {
    const names = [
      "Tramuntana",
      "Gregal",
      "Llevant",
      "Xaloc",
      "Migjorn",
      "Garbí",
      "Ponent",
      "Mestral"
    ];

    return names[Math.round(deg / 45) % 8];
  }

  function windLabel(deg) {
    return `${windNameCatalan(deg)} · ${directionName(deg)}`;
  }

  function capitalizeWords(text) {
    return text
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function formatUpdated(date) {
    const formatted = date.toLocaleString("ca-ES", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });

    return capitalizeWords(formatted);
  }

  function formatSessionDate(date) {
    const formatted = date.toLocaleDateString("ca-ES", {
      weekday: "long",
      day: "2-digit",
      month: "long"
    });

    return capitalizeWords(formatted);
  }

  function formatShortTime(isoString) {
    if (!isoString) return "--";

    return new Date(isoString).toLocaleTimeString("ca-ES", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function parseSessionTime(timeString) {
    const [hour, minute] = timeString.split(":").map(Number);
    return { hour, minute };
  }

  function nextSessionDate(timeString, selectedDay) {
    const now = new Date();
    const { hour, minute } = parseSessionTime(timeString);

    for (let offset = 0; offset < 10; offset++) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(hour, minute, 0, 0);

      if (date.getDay() === selectedDay && date >= now) {
        return date;
      }
    }

    return now;
  }

  function findClosestForecast(hourly, targetDate) {
    let closestIndex = 0;
    let closestDistance = Infinity;

    hourly.time.forEach((time, index) => {
      const distance = Math.abs(new Date(time) - targetDate);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return {
      time: hourly.time[closestIndex],
      temp: hourly.temperature_2m[closestIndex],
      apparentTemp: hourly.apparent_temperature?.[closestIndex],
      rain: hourly.rain[closestIndex],
      wind: hourly.wind_speed_10m[closestIndex],
      direction: hourly.wind_direction_10m[closestIndex]
    };
  }

  function findClosestMarineForecast(hourly, targetDate) {
    if (!hourly || !hourly.time) return null;

    let closestIndex = 0;
    let closestDistance = Infinity;

    hourly.time.forEach((time, index) => {
      const distance = Math.abs(new Date(time) - targetDate);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return {
      waveHeight: hourly.wave_height?.[closestIndex],
      wavePeriod: hourly.wave_period?.[closestIndex],
      waveDirection: hourly.wave_direction?.[closestIndex]
    };
  }

  function findDailySun(daily, targetDate) {
    if (!daily || !daily.time) return null;

    const targetDay = targetDate.toISOString().slice(0, 10);
    const index = daily.time.findIndex(day => day === targetDay);

    if (index === -1) return null;

    return {
      sunrise: daily.sunrise?.[index],
      sunset: daily.sunset?.[index]
    };
  }

  function seaStateLabel(waveHeight) {
    if (waveHeight == null || Number.isNaN(waveHeight)) {
      return "Mar sense dades";
    }

    if (waveHeight < 0.10) return "Mar en calma";
    if (waveHeight <= 0.20) return "Onadeta";
    if (waveHeight < 0.50) return "Marejol";
    if (waveHeight < 1.25) return "Maror";
    if (waveHeight < 2.50) return "Forta maror";

    return "Maregassa";
  }

  function seaStateLevel(waveHeight) {
    if (waveHeight == null || Number.isNaN(waveHeight)) return "unknown";
    if (waveHeight < 0.10) return "calm";
    if (waveHeight <= 0.20) return "small";
    if (waveHeight < 0.50) return "moderate";
    if (waveHeight < 1.25) return "high";

    return "very-high";
  }

  function waveDirectionLabel(deg) {
    if (deg == null || Number.isNaN(deg)) return "direcció sense dades";
    return `${windNameCatalan(deg)} · ${directionName(deg)}`;
  }

  function seaMiniIconHTML(marine) {
    if (!marine || marine.waveHeight == null) return "";

    const level = seaStateLevel(marine.waveHeight);

    const className = {
      calm: "sea-mini-calm",
      small: "sea-mini-small",
      moderate: "sea-mini-moderate",
      high: "sea-mini-high",
      "very-high": "sea-mini-very-high",
      unknown: "sea-mini-moderate"
    }[level];

    const directionHTML = marine.waveDirection != null
      ? `
        <span class="sea-mini-direction">
          <span
            class="sea-mini-direction-arrow"
            style="transform: rotate(${marine.waveDirection}deg)"
            aria-hidden="true"
          >↑</span>
          ${waveDirectionLabel(marine.waveDirection)}
        </span>
      `
      : "";

    return `
      <div class="sea-mini">
        <span class="sea-mini-icon ${className}" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path fill="currentColor" d="M3 14.5c1.8 0 2.7-.7 3.6-1.4.9-.7 1.8-1.4 3.6-1.4s2.7.7 3.6 1.4c.9.7 1.8 1.4 3.6 1.4s2.7-.7 3.6-1.4v2.7c-.9.6-1.9 1.1-3.6 1.1-1.8 0-2.7-.7-3.6-1.4-.9-.7-1.8-1.4-3.6-1.4s-2.7.7-3.6 1.4c-.9.7-1.8 1.4-3.6 1.4v-2.4Z"/>
            <path fill="currentColor" opacity=".55" d="M3 9.5c1.8 0 2.7-.7 3.6-1.4.9-.7 1.8-1.4 3.6-1.4s2.7.7 3.6 1.4c.9.7 1.8 1.4 3.6 1.4s2.7-.7 3.6-1.4v2.7c-.9.6-1.9 1.1-3.6 1.1-1.8 0-2.7-.7-3.6-1.4-.9-.7-1.8-1.4-3.6-1.4s-2.7.7-3.6 1.4c-.9.7-1.8 1.4-3.6 1.4V9.5Z"/>
          </svg>
        </span>

        <span class="sea-mini-data">
          <span>
            <span class="sea-mini-value">${marine.waveHeight.toFixed(1)} m</span>
            <span class="sea-mini-label">${seaStateLabel(marine.waveHeight)}</span>
          </span>
          ${directionHTML}
        </span>
      </div>
    `;
  }

  function marineComment(marine) {
    if (!marine || marine.waveHeight == null) {
      return "No hi ha dades d'onatge per a aquesta hora.";
    }

    if (marine.waveHeight < 0.10) {
      return "Mar en calma: condicions molt favorables pel que fa a l'onatge.";
    }

    if (marine.waveHeight <= 0.20) {
      return "Onadeta: mar molt suau, en principi còmoda per remar.";
    }

    if (marine.waveHeight < 0.50) {
      return "Marejol: una mica d'onatge, però en principi assumible si l'estat real de la badia acompanya.";
    }

    if (marine.waveHeight < 1.25) {
      return "Maror: valoreu la sortida segons el nivell del grup i l'estat real de la badia.";
    }

    if (marine.waveHeight < 2.50) {
      return "Forta maror: condicions exigents. Millor mantenir-se en zona molt protegida o no sortir.";
    }

    return "Maregassa: condicions molt desfavorables per sortir a remar.";
  }

  function windComment({ wind, direction }) {
    const name = windNameCatalan(direction);

    if (name === "Garbí" && wind >= 18) {
      return "Garbí moderat o viu: pot aixecar onatge i fer més exigent la tornada. Millor no allunyar-se gaire.";
    }

    if (name === "Llevant" && wind >= 18) {
      return "Llevant moderat o viu: pot portar mar de cara i empitjorar l'estat de la badia. Cal prudència.";
    }

    if (name === "Tramuntana" && wind >= 18) {
      return "Tramuntana moderada o viva: pot ser ratxejada. Sortida possible, però cal vigilar canvis sobtats.";
    }

    if (name === "Mestral" && wind >= 18) {
      return "Mestral moderat o viu: pot ser irregular i incòmode. Millor quedar-se a prop de la costa.";
    }

    if (wind >= 40) {
      return `Vent molt fort de ${name}: condicions molt exigents. Millor evitar zones exposades i valorar no sortir.`;
    }

    if (wind >= 30) {
      return `Vent fort de ${name}: cal molta prudència. És recomanable quedar-se dins la badia i evitar trams oberts.`;
    }

    if (wind >= 22) {
      return `Vent viu de ${name}: sortida possible per a grups preparats, però millor mantenir-se a prop de la costa.`;
    }

    if (wind >= 16) {
      return `Vent moderat de ${name}: pot condicionar el rumb i fer més dura la tornada segons la direcció.`;
    }

    if (wind >= 8) {
      return `Vent suau de ${name}: en principi no hauria de dificultar gaire la sortida.`;
    }

    return `Vent molt fluix de ${name}: condicions tranquil·les pel que fa al vent.`;
  }

  function rainComment({ rain }) {
    if (rain >= 5) {
      return "Pluja abundant prevista: sortida incòmoda, amb possible pèrdua de visibilitat.";
    }

    if (rain >= 3) {
      return "Pluja notable: valoreu si compensa sortir i porteu roba adequada.";
    }

    if (rain >= 0.8) {
      return "Pot ploure una mica: sortida possible, però convé anar preparats.";
    }

    return "";
  }

  function lightsComment(targetDate, sun) {
    if (!sun?.sunset) return "";

    const sunsetDate = new Date(sun.sunset);
    const minutesToSunset = Math.round((sunsetDate - targetDate) / 60000);

    if (minutesToSunset <= 90 && minutesToSunset >= -30) {
      return "Sortida propera a la posta de sol: cal portar llums i tenir-les a punt abans que baixi la llum.";
    }

    if (minutesToSunset < -30) {
      return "Sortida després de la posta de sol: cal sortir amb llums.";
    }

    return "";
  }

  function rowingRecommendation({ wind, rain }, marine) {
    const waveHeight = marine?.waveHeight ?? 0;

    if (
      wind >= 45 ||
      rain >= 12 ||
      waveHeight >= 2.50 ||
      (wind >= 35 && rain >= 5)
    ) {
      return {
        text: "Millor ajornar la sortida",
        color: "#b91c1c"
      };
    }

    if (wind >= 30 || rain >= 5 || waveHeight >= 1.25) {
      return {
        text: "Quedar-se dins la badia",
        color: "#b7791f"
      };
    }

    if (wind >= 18 || rain >= 0.8 || waveHeight >= 0.70) {
      return {
        text: "Sortida amb precaució",
        color: "#b7791f"
      };
    }

    return {
      text: "Bones condicions",
      color: "#16803c"
    };
  }

  function sessionAlert({ wind, rain }, marine) {
    const alerts = [];

    if (rain >= 3) alerts.push("pluja prevista");
    if (wind >= 30) alerts.push("vent fort");
    if (marine && marine.waveHeight >= 1.25) alerts.push("onatge important");

    return alerts.length
      ? `Avís per al grup: ${alerts.join(", ")}. Reviseu l'estat real abans de sortir.`
      : "";
  }

  function windVisualConfig(speed) {
    if (speed < 10) {
      return { color: "#008fa3", count: 60, opacity: 0.58, duration: 5.6 };
    }

    if (speed < 18) {
      return { color: "#164782", count: 80, opacity: 0.68, duration: 4.8 };
    }

    if (speed < 25) {
      return { color: "#e85d04", count: 100, opacity: 0.76, duration: 4.0 };
    }

    return { color: "#be123c", count: 120, opacity: 0.84, duration: 3.3 };
  }

  function buildWindStreams(count, duration) {
    const layer = document.getElementById("windStreamLayer");
    if (!layer) return;

    layer.innerHTML = "";

    const cols = 18;
    const rows = Math.ceil(count / cols);

    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "wind-stream";

      const col = i % cols;
      const row = Math.floor(i / cols);
      const usableWidth = 96;
      const usableHeight = 90;
      const leftStart = 1;
      const topStart = 3;
      const leftStep = usableWidth / Math.max(cols - 1, 1);
      const topStep = usableHeight / Math.max(rows - 1, 1);
      const leftJitter = ((i * 13) % 5) - 2;
      const topJitter = ((i * 17) % 5) - 2;

      el.style.left = `${leftStart + col * leftStep + leftJitter}%`;
      el.style.top = `${topStart + row * topStep + topJitter}%`;
      el.style.animationDelay = `${-(i * 0.06)}s`;
      el.style.animationDuration = `${duration + (i % 4) * 0.08}s`;
      el.style.scale = `${0.9 + (i % 3) * 0.05}`;

      layer.appendChild(el);
    }
  }

  function updateWindOverlay(speed, direction) {
    const layer = document.getElementById("windStreamLayer");
    const layerShell = layer?.closest(".wind-stream-layer");

    if (!layer || !layerShell) return;

    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile) return;

    const config = windVisualConfig(speed);
    const rotation = direction + 90;

    layerShell.classList.add("is-fading");

    window.setTimeout(() => {
      layer.style.setProperty("--wind-color", config.color);
      layer.style.setProperty("--wind-opacity", config.opacity);
      layer.style.setProperty("--wind-angle", `${rotation}deg`);
      buildWindStreams(config.count, config.duration);

      requestAnimationFrame(() => {
        layerShell.classList.remove("is-fading");
      });
    }, 280);
  }

  function updateSessionForecast(data) {
    cachedWeatherData = data;

    const weatherHourly = data.weather.hourly;
    const marineHourly = data.marine?.hourly;
    const weatherDaily = data.weather.daily;

    const targetDate = nextSessionDate(selectedSessionTime, selectedSessionDay);
    const session = findClosestForecast(weatherHourly, targetDate);
    const marine = findClosestMarineForecast(marineHourly, targetDate);
    const sun = findDailySun(weatherDaily, targetDate);

    const status = rowingRecommendation(session, marine);
    const windText = windComment(session);
    const rainText = rainComment(session);
    const seaText = marineComment(marine);
    const lightText = lightsComment(targetDate, sun);
    const alertText = sessionAlert(session, marine);
    const windArrowRotation = session.direction + 180;

    const commentParts = [
      windText,
      rainText,
      seaText,
      lightText
    ].filter(Boolean);

    document.getElementById("sessionSummary").innerHTML = `
      <strong>${formatSessionDate(targetDate)} · ${selectedSessionTime}</strong>

      <span class="forecast-used">
        Previsió més propera: ${formatShortTime(session.time)}
      </span>

      <span class="status-line">
        <span class="status-dot" style="background:${status.color}"></span>
        ${status.text}
      </span>

      <div class="session-meta">
        <span class="meta-pill">🌧️ ${session.rain.toFixed(1)} mm</span>
        <span class="meta-pill">🌡️ ${Math.round(session.temp)} °C</span>
        <span class="meta-pill">Sensació ${session.apparentTemp != null ? Math.round(session.apparentTemp) + " °C" : "--"}</span>
      </div>

      <div class="mini-wind-card">
        <div class="wind-sea-stack">
          <div class="mini-compass" aria-label="Direcció del vent">
            <span class="north">N</span>
            <span class="south">S</span>
            <span class="mini-compass-arrow-wrap" id="windArrowInline">
              <svg class="mini-compass-arrow" viewBox="0 0 64 64" aria-hidden="true">
                <path fill="currentColor" d="M32 4l15 38-15-8-15 8L32 4z"></path>
                <path fill="currentColor" opacity=".35" d="M28 32h8v24h-8z"></path>
              </svg>
            </span>
          </div>

          <div class="wind-mini-data">
            <strong>${Math.round(session.wind)} km/h</strong>
            <span>${windLabel(session.direction)}</span>
          </div>

          ${seaMiniIconHTML(marine)}
        </div>

        <div class="mini-wind-info">
          <div class="forecast-comment">
            ${commentParts.join("<br>")}
          </div>

          ${alertText ? `<div class="forecast-alert">${alertText}</div>` : ""}

          <div class="sun-info">
            <span>🌅 Sortida ${formatShortTime(sun?.sunrise)}</span>
            <span>🌇 Posta ${formatShortTime(sun?.sunset)}</span>
          </div>
        </div>
      </div>
    `;

    const inlineArrow = document.getElementById("windArrowInline");

    if (inlineArrow) {
      inlineArrow.style.transform = `rotate(${windArrowRotation}deg)`;
    }

    updateWindOverlay(session.wind, session.direction);
  }

  function syncControls() {
    document.querySelectorAll(".day-btn").forEach(btn => {
      btn.classList.toggle(
        "active",
        Number(btn.dataset.day) === selectedSessionDay
      );
    });

    document.querySelectorAll(".session-btn").forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.time === selectedSessionTime
      );
    });
  }

  function attachControlEvents() {
    document.querySelectorAll(".day-btn").forEach(button => {
      button.addEventListener("click", () => {
        selectedSessionDay = Number(button.dataset.day);
        syncControls();

        if (cachedWeatherData) {
          updateSessionForecast(cachedWeatherData);
        }

        if (map) {
          setTimeout(() => map.invalidateSize(), 100);
        }
      });
    });

    document.querySelectorAll(".session-btn").forEach(button => {
      button.addEventListener("click", () => {
        selectedSessionTime = button.dataset.time;
        syncControls();

        if (cachedWeatherData) {
          updateSessionForecast(cachedWeatherData);
        }

        if (map) {
          setTimeout(() => map.invalidateSize(), 100);
        }
      });
    });
  }

  async function loadWeather() {
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");

    weatherUrl.search = new URLSearchParams({
      latitude: SANT_FELIU.lat,
      longitude: SANT_FELIU.lon,
      hourly: "temperature_2m,apparent_temperature,rain,wind_speed_10m,wind_direction_10m",
      daily: "sunrise,sunset",
      forecast_days: "7",
      timezone: "Europe/Madrid",
      wind_speed_unit: "kmh"
    });

    const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");

    marineUrl.search = new URLSearchParams({
      latitude: 41.776,
      longitude: 3.045,
      hourly: "wave_height,wave_direction,wave_period",
      forecast_days: "7",
      timezone: "Europe/Madrid"
    });

    try {
      const [weatherResponse, marineResponse] = await Promise.all([
        fetch(weatherUrl),
        fetch(marineUrl)
      ]);

      if (!weatherResponse.ok) {
        throw new Error("No s'ha pogut carregar la previsió meteorològica");
      }

      const weather = await weatherResponse.json();
      const marine = marineResponse.ok ? await marineResponse.json() : null;

      document.getElementById("updatedAt").textContent = `Actualitzat: ${formatUpdated(new Date())}`;

      updateSessionForecast({
        weather,
        marine
      });
    } catch (error) {
      document.getElementById("updatedAt").textContent = "No s'ha pogut carregar la previsió.";
      document.getElementById("sessionSummary").textContent = "Hi ha hagut un problema carregant les dades meteorològiques.";
      console.error(error);
    }
  }

  function runSmokeTests() {
    console.assert(Boolean(document.getElementById("map")), "Falta #map");
    console.assert(directionName(0) === "N", "directionName(0) debería ser N");
    console.assert(windNameCatalan(225) === "Garbí", "225° debería ser Garbí");
    console.assert(nextSessionDate("08:00", 1) instanceof Date, "nextSessionDate debería devolver Date");
    console.assert(seaStateLabel(0.05) === "Mar en calma", "0.05 m debería ser Mar en calma");
    console.assert(seaStateLabel(0.15) === "Onadeta", "0.15 m debería ser Onadeta");
  }

  runSmokeTests();
  attachControlEvents();
  syncControls();
  initMap();
  loadWeather();

  window.setInterval(loadWeather, 30 * 60 * 1000);

  window.addEventListener("resize", () => {
    if (map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  });
});
