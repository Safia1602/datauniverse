document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded. Running page1-dashboard.js v2 (Robust)");

  const COLOR_ACCENT = "cyan";
  const COLOR_ACCENT_HOVER = "#00ffff";
  const COLOR_GRAY = "#aaa";
  const COLOR_BG_DARK = "#333";
  const COLOR_BG_BODY = "#000";

  const dataPath = "/api/stats-data";

  // --- FONCTIONS UTILITAIRES ROBUSTES ---

  function toBool(v) {
    if (v === true || v === false) return v;
    if (v === null || v === undefined) return false;
    const s = String(v).trim().toLowerCase();
    return ["true", "1", "yes", "y", "oui"].includes(s);
  }

  function toList(v) {
    // Cas 1 : C'est déjà une liste (top !)
    if (Array.isArray(v)) {
      return v.map((x) => String(x).trim()).filter((x) => x.length > 0);
    }
    // Cas 2 : C'est vide
    if (v === null || v === undefined) return [];

    // Cas 3 : C'est une chaîne de caractères (nettoyage agressif)
    let s = String(v).trim();
    if (!s || s === "[]" || s === "{}") return [];

    // Nettoyage des formatages Python/Postgres (crochets, accolades, guillemets)
    // Ex: "['Python', 'SQL']" ou "{Python,SQL}"
    s = s.replace(/^[\s\[\{]+|[\s\]\}]+$/g, ""); // Enlève [ { ] } au début/fin
    s = s.replace(/'/g, '"'); // Remplace simple quote par double

    // Split par virgule, point-virgule ou pipe
    return s
      .split(/;|,|\|/)
      .map((x) => x.replace(/['"]/g, "").trim()) // Enlève les guillemets restants
      .filter((x) => x.length > 0);
  }

  const showTooltip = (event, content, tooltip) => {
    tooltip
      .style("opacity", 1)
      .html(content)
      .style("left", event.pageX + 15 + "px")
      .style("top", event.pageY - 28 + "px");
  };

  const hideTooltip = (tooltip) => {
    tooltip.style("opacity", 0);
  };

  function aggregateData(data, column, isList = false) {
    const counts = new Map();

    data.forEach((d) => {
      const raw = d[column];
      const items = isList ? toList(raw) : [raw]; // Utilise notre toList robuste

      items.forEach((item) => {
        const key =
          item === null || item === undefined ? "" : String(item).trim();
        if (!key || key === "Not specified" || key === "nan") return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return Array.from(counts, ([name, count]) => ({ name, count }));
  }

  // --- CHARGEMENT DES DONNÉES ---

  d3.json(dataPath)
    .then((data) => {
      console.log(`Data loaded: ${data?.length} items.`);

      if (!data || data.length === 0) {
        console.warn("Aucune donnée reçue !");
        return;
      }

      const processedData = data.map((d) => ({
        ...d,
        // Conversion sécurisée des nombres
        salary_value: d.salary_value ? +d.salary_value : null,
        experience_years: d.experience_years ? +d.experience_years : null,

        // Nettoyage des booléens
        hybrid_policy: toBool(d.hybrid_policy),
        visa_sponsorship: toBool(d.visa_sponsorship),

        // Nettoyage des listes (Tech skills, tools...)
        technical_skills: toList(d.technical_skills),
        tools_used: toList(d.tools_used),
        domains: toList(d.domains),

        // Nettoyage des chaînes
        seniority_level: d.seniority_level || "Not specified",
        country: d.country || "Not specified",
        source: d.source || "N/A",
        title: d.title || "Untitled",
        company: d.company || "Unknown",
        
        // Normalisation pour le salaire (minuscule pour comparaison facile)
        _salary_type: (d.salary_type || "").toLowerCase(),
        _salary_currency: (d.salary_currency || "").toUpperCase()
      }));

      // --- INITIALISATION DES GRAPHIQUES ---

      const tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "d3-tooltip")
        .style("position", "absolute")
        .style("background", "rgba(0,0,0,0.9)")
        .style("padding", "5px")
        .style("border", "1px solid cyan")
        .style("border-radius", "4px")
        .style("pointer-events", "none")
        .style("opacity", 0);

      updateKPIs(processedData);

      // 1. Tech Skills
      createGenericBarChart(
        { data: processedData, column: "technical_skills", isList: true },
        "#viz-tech-skills",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      // 2. Tools
      createGenericBarChart(
        { data: processedData, column: "tools_used", isList: true },
        "#viz-tools",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      // 3. Salaire (Histogramme)
      createSalaryHistogram(
        processedData,
        "#viz-salary-dist",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      // 4. Géographie
      createGenericBarChart(
        { data: processedData, column: "country", isList: false },
        "#viz-geo",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      // 5. Domaines
      createGenericBarChart(
        { data: processedData, column: "domains", isList: true },
        "#viz-domains",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      // 6. Seniority (Pie)
      createSeniorityChart(processedData, "#viz-seniority", tooltip);

      // 7. Policies (Pies)
      createPolicyPieChart(
        processedData,
        "hybrid_policy",
        "#viz-hybrid",
        tooltip,
        ["Hybrid/Remote", "On-site"],
        [COLOR_ACCENT, COLOR_BG_DARK]
      );

      createPolicyPieChart(
        processedData,
        "visa_sponsorship",
        "#viz-visa",
        tooltip,
        ["Visa OK", "Visa No"],
        [COLOR_ACCENT, COLOR_BG_DARK]
      );

      createSourceChart(processedData, "#viz-source", tooltip, [
        COLOR_ACCENT,
        COLOR_BG_DARK,
      ]);

      // 8. Top Lists (Dashboard page)
      createTopTitles(processedData, "#chart-titles", tooltip);
      createTopCompanies(processedData, "#chart-companies", tooltip);

      setupModalListeners();
      console.log("Charts rendering complete.");
    })
    .catch((error) => {
      console.error(`Error loading data:`, error);
    });

  // --- LOGIQUE KPI ---
  function updateKPIs(data) {
    if(d3.select("#kpi-total-value").empty()) return;
    
    d3.select("#kpi-total-value").text(data.length);

    const uniqueCompanies = new Set(data.map((d) => d.company).filter(Boolean));
    d3.select("#kpi-total-companies").text(uniqueCompanies.size);

    // Filtre salaire plus souple
    const annualSalaries = data
      .filter(d => 
         (d._salary_currency === "USD" || d._salary_currency === "$") &&
         (d._salary_type.includes("annual") || d._salary_type.includes("year")) &&
         d.salary_value > 1000
      )
      .map((d) => d.salary_value);

    const medianSalary = d3.median(annualSalaries);
    d3.select("#kpi-median-salary").text(
      medianSalary ? `$${(medianSalary / 1000).toFixed(0)}k` : "N/A"
    );
  }

  // --- GRAPHIQUE BARRES GÉNÉRIQUE ---
  function createGenericBarChart(config, selector, tooltip, color, hoverColor) {
    const vizElement = d3.select(selector);
    if (vizElement.empty()) return;
    vizElement.html(""); // Reset

    const aggregated = aggregateData(config.data, config.column, config.isList);
    const topData = aggregated.sort((a, b) => b.count - a.count).slice(0, 10);

    if (topData.length === 0) {
      vizElement.html("<div style='padding:20px; color:#666;'>No data available</div>");
      return;
    }

    // Récupérer la taille réelle
    const containerNode = vizElement.node();
    const width = containerNode.clientWidth || 400;
    const height = containerNode.clientHeight || 250;
    
    const margin = { top: 10, right: 30, bottom: 40, left: 120 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = vizElement
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const y = d3.scaleBand()
      .domain(topData.map((d) => d.name))
      .range([0, innerH])
      .padding(0.2);

    const x = d3.scaleLinear()
      .domain([0, d3.max(topData, (d) => d.count) || 1])
      .range([0, innerW]);

    svg.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .select(".domain").remove();

    svg.append("g")
      .attr("transform", `translate(0, ${innerH})`)
      .call(d3.axisBottom(x).ticks(5));

    svg.selectAll(".bar")
      .data(topData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("y", (d) => y(d.name))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0) // Animation start
      .attr("fill", color)
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill", hoverColor);
        showTooltip(event, `<b>${d.name}</b><br>${d.count} offers`, tooltip);
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill", color);
        hideTooltip(tooltip);
      })
      .transition().duration(800)
      .attr("width", (d) => x(d.count));
  }

  // --- HISTOGRAMME SALAIRE (Logique Assouplie) ---
  function createSalaryHistogram(data, selector, tooltip, color, hoverColor) {
    // Filtre beaucoup plus permissif : USD + (Annual OU Yearly)
    const annualSalaries = data
      .filter(d => 
         (d._salary_currency === "USD" || d._salary_currency === "$") &&
         (d._salary_type.includes("annual") || d._salary_type.includes("year")) &&
         d.salary_value > 20000 && d.salary_value < 600000
      )
      .map((d) => d.salary_value);

    const vizElement = d3.select(selector);
    if (vizElement.empty()) return;
    vizElement.html("");

    if (annualSalaries.length === 0) {
      vizElement.html("<div style='padding:20px; color:#666;'>No salary data found (USD/Annual)</div>");
      return;
    }

    const containerNode = vizElement.node();
    const width = containerNode.clientWidth || 400;
    const height = containerNode.clientHeight || 250;
    const margin = { top: 10, right: 30, bottom: 40, left: 50 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = vizElement
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const x = d3.scaleLinear()
      .domain(d3.extent(annualSalaries))
      .nice()
      .range([0, innerW]);

    const histogram = d3.bin().domain(x.domain()).thresholds(x.ticks(15));
    const bins = histogram(annualSalaries);

    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) || 1])
      .range([innerH, 0]);

    svg.append("g")
      .attr("transform", `translate(0, ${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `$${Math.round(d / 1000)}k`));

    svg.append("g").call(d3.axisLeft(y).ticks(5));

    svg.selectAll("rect")
      .data(bins)
      .enter()
      .append("rect")
      .attr("x", (d) => x(d.x0) + 1)
      .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("y", innerH)
      .attr("height", 0)
      .attr("fill", color)
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill", hoverColor);
        showTooltip(event, `<b>Range: $${d.x0/1000}k - $${d.x1/1000}k</b><br>${d.length} jobs`, tooltip);
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill", color);
        hideTooltip(tooltip);
      })
      .transition().duration(800)
      .attr("y", (d) => y(d.length))
      .attr("height", (d) => innerH - y(d.length));
  }

  // --- PIE CHARTS (Logique standard) ---
  function createGenericPieChart(pieInput, selector, tooltip, colorRange) {
    const vizElement = d3.select(selector);
    if (vizElement.empty()) return;
    vizElement.html("");

    const containerNode = vizElement.node();
    const width = containerNode.clientWidth || 200;
    const height = containerNode.clientHeight || 200;
    const radius = Math.min(width, height) / 2;

    const svg = vizElement.append("svg")
      .attr("width", width).attr("height", height)
      .append("g")
      .attr("transform", `translate(${width/2}, ${height/2})`);

    const color = d3.scaleOrdinal().domain(pieInput.map(d=>d.name)).range(colorRange);
    const pie = d3.pie().value(d=>d.value).sort(null);
    const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius * 0.9);

    svg.selectAll("path")
      .data(pie(pieInput))
      .enter()
      .append("path")
      .attr("fill", d => color(d.data.name))
      .attr("d", arc)
      .on("mouseover", (event, d) => {
        const total = d3.sum(pieInput, x=>x.value);
        const p = ((d.data.value/total)*100).toFixed(1);
        showTooltip(event, `<b>${d.data.name}</b><br>${d.data.value} (${p}%)`, tooltip);
      })
      .on("mouseout", () => hideTooltip(tooltip));
  }

  function createPolicyPieChart(data, column, selector, tooltip, labels, colors) {
    const trueCount = data.filter(d => d[column] === true).length;
    const falseCount = data.length - trueCount;
    createGenericPieChart([
      {name: labels[0], value: trueCount},
      {name: labels[1], value: falseCount}
    ], selector, tooltip, colors);
  }

  function createSeniorityChart(data, selector, tooltip) {
    const agg = aggregateData(data, "seniority_level", false).sort((a,b)=>b.count-a.count);
    const top = agg.slice(0, 5);
    const other = d3.sum(agg.slice(5), d=>d.count);
    if(other > 0) top.push({name: "Other", value: other});
    createGenericPieChart(top, selector, tooltip, [COLOR_ACCENT, "#888", "#666", "#444", "#222", "#111"]);
  }

  function createSourceChart(data, selector, tooltip, colors) {
    const agg = aggregateData(data, "source", false).sort((a,b)=>b.count-a.count);
    if(!agg.length) return;
    const top = agg[0];
    const other = d3.sum(agg.slice(1), d=>d.count);
    createGenericPieChart([{name: top.name, value: top.count}, {name: "Other", value: other}], selector, tooltip, colors);
  }

  // --- TOP LISTS (TITLES / COMPANIES) ---
  function createTopTitles(data, selector, tooltip) {
    const agg = aggregateData(data, "title", false).sort((a,b)=>b.count-a.count).slice(0,10);
    renderSimpleBarChart(agg, selector, tooltip, COLOR_ACCENT, 140);
  }

  function createTopCompanies(data, selector, tooltip) {
    const agg = aggregateData(data, "company", false).sort((a,b)=>b.count-a.count).slice(0,10);
    renderSimpleBarChart(agg, selector, tooltip, COLOR_ACCENT_HOVER, 100);
  }

  function renderSimpleBarChart(data, selector, tooltip, color, leftMargin) {
    const host = d3.select(selector);
    if(host.empty()) return;
    host.html("");

    const width = 800, height = 300; 
    const margin = {top: 20, right: 20, bottom: 20, left: leftMargin};
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = host.append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand().domain(data.map(d=>d.name)).range([0, innerH]).padding(0.2);
    const x = d3.scaleLinear().domain([0, d3.max(data, d=>d.count)]).range([0, innerW]);

    svg.append("g").call(d3.axisLeft(y));
    svg.selectAll(".bar")
      .data(data)
      .enter().append("rect")
      .attr("y", d=>y(d.name))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", d=>x(d.count))
      .attr("fill", color)
      .on("mouseover", (event, d) => showTooltip(event, `<b>${d.name}</b><br>${d.count}`, tooltip))
      .on("mouseout", () => hideTooltip(tooltip));
  }

  function createLegend(selector, data, color) { /* ... (Optionnel) ... */ }
  function setupModalListeners() { /* ... (Optionnel) ... */ }
});
