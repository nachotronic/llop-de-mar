/*
  app.js · Llop de Mar
  ------------------------------------------------------------
  Este archivo contiene toda la lógica de la web:
  - carga del mapa CARTO/Leaflet
  - consulta de previsión meteorológica Open-Meteo
  - consulta de previsión marina Open-Meteo Marine
  - selección de día/hora del grupo
  - mensajes de recomendación
  - comentarios de viento, lluvia, mar y luces
  - flechas animadas de viento en desktop

  Para modificar textos:
  - viento: busca function windComment(...)
  - lluvia: busca function rainComment(...)
  - mar: busca function marineComment(...)
  - recomendación principal: busca function rowingRecommendation(...)
  - estado de la mar: busca function seaStateLabel(...)
*/

document.addEventListener("DOMContentLoaded", () => {
  /*
    Coordenadas aproximadas de Sant Feliu de Guíxols.
    Se usan para la previsión meteorológica general.
  */
  const SANT_FELIU = { lat: 41.781, lon: 3.0345 };

  /*
    Estado actual de la selección.
    selectedSessionDay:
    - 1 = dilluns/lunes
    - 3 = dimecres/miércoles

    selectedSessionTime:
    - hora del grupo elegido
  */
  let selectedSessionTime = "08:00";
  let selectedSessionDay = 1;

  /*
    Guardamos los datos cargados para no tener que llamar a la API
    cada vez que el usuario cambia de botón.
  */
  let cachedWeatherData = null;

  /*
    Referencia al mapa Leaflet.
  */
  let map = null;

  /*
    MAPA
    ------------------------------------------------------------
    Inicializa Leaflet con una capa CARTO clara.
    En móvil mantenemos el mapa, pero sin flechas animadas encima
    para evitar problemas de rendimiento/visualización.
  */
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

    /*
      Leaflet a veces necesita recalcular tamaño cuando carga dentro
      de contenedores responsive.
    */
    setTimeout(() => map.invalidateSize(), 250);
    setTimeout(() => map.invalidateSize(), 900);
  }

  /*
    DIRECCIONES
    ------------------------------------------------------------
    Convierte grados en direcciones abreviadas y nombres de viento.
  */
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

  /*
    FORMATO DE FECHAS Y HORAS
    ------------------------------------------------------------
  */
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

  /*
    CÁLCULO DEL PRÓXIMO DÍA/HORA DE SALIDA
    ------------------------------------------------------------
    Busca la próxima fecha futura que coincida con el día elegido
    y la hora del grupo.
  */
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

  /*
    SELECCIÓN DE LA PREVISIÓN MÁS CERCANA
    ------------------------------------------------------------
    Open-Meteo devuelve datos horarios. Para salidas tipo 17:45,
    buscamos la hora de previsión más cercana.
  */
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

  /*
    ESTADO DE LA MAR
    ------------------------------------------------------------
    Aquí puedes modificar las categorías de altura de ola.

    Importante:
    - He interpretado "0 a 0.9" como 0 a 0,09 m.
    - He interpretado "01 a 02" como 0,10 a 0,20 m.
    Así evitamos que las franjas se solapen.

    Cambia los límites si el club usa otros criterios.
  */
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

  function waveDirectionLabel(deg) {
    if (deg == null || Number.isNaN(deg)) return "direcció sense dades";
    return `${windNameCatalan(deg)} · ${directionName(deg)}`;
  }

  /*
    Flecha visual para la dirección de la ola en la píldora de mar.
    Si la flecha se ve al revés, cambia deg por deg + 180.
  */
  function waveArrowHTML(deg) {
    if (deg == null || Number.isNaN(deg)) return "";
    return `<span class="wave-arrow-inline" style="transform: rotate(${deg}deg)" aria-hidden="true">↑</span>`;
  }

  /*
    Comentario sobre la mar.
    Aquí hemos quitado la dirección del onatge en el comentario,
    como pediste. La dirección sigue apareciendo en la píldora de mar.
  */
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

  /*
    COMENTARIO DE VIENTO
    ------------------------------------------------------------
    Este es el sitio principal para añadir más frases sobre el viento.

    Puedes modificar:
    - los umbrales de velocidad
    - los textos
    - las frases específicas según el nombre del viento
  */
  function windComment({ wind, direction }) {
    const name = windNameCatalan(direction);

    /*
      Casos específicos por dirección.
      Estos mensajes se evalúan antes que los generales.
    */
    if (name === "Garbí" && wind >= 18) {
      return "Garbí moderat o viu: pot aixecar onatge i fer més exigent la tornada si anem cap a Sant Pol. Millor no allunyar-se gaire.";
    }

    if (name === "Llevant" && wind >= 18) {
      return "Llevant moderat o viu: pot empitjorar l'estat de la badia. Cal prudència.";
    }

    if (name === "Tramuntana" && wind >= 18) {
      return "Tramuntana moderada o viva: pot ser ratxejada. Sortida possible, però cal vigilar canvis sobtats.";
    }

    if (name === "Mestral" && wind >= 18) {
      return "Mestral moderat o viu: pot ser irregular i incòmode. Millor quedar-se a prop de la costa.";
    }

    /*
      Casos generales por intensidad.
    */
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

  /*
    COMENTARIO DE LLUVIA
    ------------------------------------------------------------
    Frases separadas para lluvia.
    Si no hay lluvia relevante, devuelve texto vacío.
  */
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

  /*
    COMENTARIO DE LUCES
    ------------------------------------------------------------
    Añade aviso si la salida está cerca o después de la puesta de sol.
  */
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

  /*
    RECOMENDACIÓN PRINCIPAL
    ------------------------------------------------------------
    Esta función decide la frase grande:
    - Bones condicions
    - Sortida amb precaució
    - Quedar-se dins la badia
    - Millor ajornar la sortida

    La recomendación de ajornar es intencionadamente restrictiva.
  */
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

  /*
    ALERTA ESPECÍFICA DEL GRUPO
    ------------------------------------------------------------
    Esta frase aparece en una caja de aviso si hay condiciones relevantes.
  */
  function sessionAlert({ wind, rain }, marine) {
    const alerts = [];

    if (rain >= 3) alerts.push("pluja prevista");
    if (wind >= 30) alerts.push("vent fort");
    if (marine && marine.waveHeight >= 1.25) alerts.push("onatge important");

    return alerts.length
      ? `Avís per al grup: ${alerts.join(", ")}. Reviseu l'estat real abans de sortir.`
      : "";
  }

  /*
    FLECHAS DE VIENTO EN EL MAPA
    ------------------------------------------------------------
    Solo se muestran en escritorio.
    En móvil se desactivan por CSS y también por JS para evitar problemas.
  */
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

    /*
      Evitamos flechas en móvil/tablet.
    */
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

  /*
    ACTUALIZACIÓN DE LA PREVISIÓN EN PANTALLA
    ------------------------------------------------------------
    Esta función construye todo el HTML del panel de previsión.
  */
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
    const seaComment = marineComment(marine);
    const lightText = lightsComment(targetDate, sun);
    const alertText = sessionAlert(session, marine);

    /*
      La flecha de la rosa de viento parte de una flecha vertical.
      Sumamos 180 para representar de forma visual la dirección del viento.
    */
    const windArrowRotation = session.direction + 180;

    const commentParts = [
      windText,
      rainText,
      seaComment,
      lightText
    ].filter(Boolean);

    const marineDirection = marine?.waveDirection != null
      ? ` · ${waveArrowHTML(marine.waveDirection)} ${waveDirectionLabel(marine.waveDirection)}`
      : "";

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
        <span class="meta-pill">🌡️ ${Math.round(session.temp)} °C</span>
        <span class="meta-pill">Sensació ${session.apparentTemp != null ? Math.round(session.apparentTemp) + " °C" : "--"}</span>
        <span class="meta-pill">🌧️ ${session.rain.toFixed(1)} mm</span>
        <span class="meta-pill sea-pill">
          🌊 ${marine && marine.waveHeight != null ? marine.waveHeight.toFixed(1) + " m" : "--"}
          · ${marine ? seaStateLabel(marine.waveHeight) : "Mar sense dades"}
          ${marineDirection}
        </span>
      </div>

      <div class="mini-wind-card">
        <div class="mini-compass" aria-label="Direcció del vent">
          <span class="mini-compass-arrow-wrap" id="windArrowInline">
            <svg class="mini-compass-arrow" viewBox="0 0 64 64" aria-hidden="true">
              <path fill="currentColor" d="M32 4l15 38-15-8-15 8L32 4z"></path>
              <path fill="currentColor" opacity=".35" d="M28 32h8v24h-8z"></path>
            </svg>
          </span>
        </div>

        <div class="mini-wind-info">
          <strong>${Math.round(session.wind)} km/h</strong>
          <span>${windLabel(session.direction)}</span>
          <div class="forecast-comment">
            ${commentParts.join("<br>")}
          </div>
          ${alertText ? `<div class="forecast-alert">${alertText}</div>` : ""}
        </div>
      </div>

      <div class="sun-info">
        <span>🌅 Sortida ${formatShortTime(sun?.sunrise)}</span>
        <span>🌇 Posta ${formatShortTime(sun?.sunset)}</span>
      </div>
    `;

    const inlineArrow = document.getElementById("windArrowInline");

    if (inlineArrow) {
      inlineArrow.style.transform = `rotate(${windArrowRotation}deg)`;
    }

    updateWindOverlay(session.wind, session.direction);
  }

  /*
    CONTROLES DE BOTONES
    ------------------------------------------------------------
    Sincroniza los botones duplicados:
    - controles de escritorio bajo el mapa
    - controles móviles dentro del panel
  */
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

  /*
    CARGA DE DATOS
    ------------------------------------------------------------
    Open-Meteo:
    - temperatura
    - sensación térmica
    - lluvia
    - viento
    - salida/puesta de sol

    Open-Meteo Marine:
    - altura de ola
    - dirección de ola
    - periodo de ola
  */
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

  /*
    TESTS BÁSICOS
    ------------------------------------------------------------
    No son tests formales, pero ayudan a detectar errores
    en consola si algo se rompe.
  */
  function runSmokeTests() {
    console.assert(Boolean(document.getElementById("map")), "Falta #map");
    console.assert(directionName(0) === "N", "directionName(0) debería ser N");
    console.assert(windNameCatalan(225) === "Garbí", "225° debería ser Garbí");
    console.assert(nextSessionDate("08:00", 1) instanceof Date, "nextSessionDate debería devolver Date");
    console.assert(seaStateLabel(0.05) === "Mar en calma", "0.05 m debería ser Mar en calma");
    console.assert(seaStateLabel(0.15) === "Onadeta", "0.15 m debería ser Onadeta");
  }

  /*
    ARRANQUE
    ------------------------------------------------------------
  */
  runSmokeTests();
  attachControlEvents();
  syncControls();
  initMap();
  loadWeather();

  /*
    Actualiza la previsión cada 30 minutos si la página queda abierta.
  */
  window.setInterval(loadWeather, 30 * 60 * 1000);

  /*
    Recalcula el mapa si cambia el tamaño de la ventana.
  */
  window.addEventListener("resize", () => {
    if (map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  });
});
