document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded. Running page1-dashboard.js");

  const COLOR_ACCENT = "cyan";
  const COLOR_ACCENT_HOVER = "#00ffff";
  const COLOR_GRAY = "#aaa";
  const COLOR_BG_DARK = "#333";
  const COLOR_BG_BODY = "#000";

  const dataPath = "/api/stats-data";
  function toBool(v) {
    if (v === true || v === false) return v;
    if (v === null || v === undefined) return false;
    const s = String(v).trim().toLowerCase();
    return ["true", "1", "yes", "y", "oui"].includes(s);
  }

  function toList(v) {
    if (Array.isArray(v)) {
      return v.map((x) => String(x).trim()).filter((x) => x.length > 0);
    }

    if (v === null || v === undefined) return [];

    const s = String(v).trim();
    if (!s || s === "[]") return [];

    // remove crochets + quotes and split
    return s
      .replace(/^\s*\[|\]\s*$/g, "")
      .replace(/['"]/g, "")
      .split(/;|,|\|/)
      .map((x) => x.trim())
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

      const items = isList ? (Array.isArray(raw) ? raw : toList(raw)) : [raw];

      items.forEach((item) => {
        const key =
          item === null || item === undefined ? "" : String(item).trim();
        if (!key || key === "Not specified") return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return Array.from(counts, ([name, count]) => ({ name, count }));
  }

  function createLegend(containerSelector, pieData, colorScale) {
    const host = d3.select(containerSelector).node();
    if (!host) return;

    // clean the precedent legend
    const parent = host.parentNode;
    const existing = parent.querySelector(".d3-legend");
    if (existing) existing.remove();

    const legendContainer = parent.appendChild(document.createElement("div"));
    d3.select(legendContainer).attr("class", "d3-legend");

    d3.select(legendContainer)
      .selectAll(".legend-item")
      .data(pieData)
      .enter()
      .append("div")
      .attr("class", "legend-item")
      .html(
        (d) => `
          <div class="legend-swatch" style="background-color:${colorScale(
            d.name
          )}"></div>
          <span>${d.name} (${d.value})</span>
        `
      );
  }

  // 1) Load + preprocess
  d3.json(dataPath)
    .then((data) => {
      console.log(`Data loaded successfully from ${dataPath}!`, data?.[0]);

      const processedData = (data || []).map((d) => ({
        ...d,

        // numbers
        salary_value:
          d.salary_value !== "" &&
          d.salary_value !== null &&
          d.salary_value !== undefined
            ? +d.salary_value
            : null,

        experience_years:
          d.experience_years !== "" &&
          d.experience_years !== null &&
          d.experience_years !== undefined
            ? +d.experience_years
            : null,

        // bools (FIX)
        hybrid_policy: toBool(d.hybrid_policy),
        visa_sponsorship: toBool(d.visa_sponsorship),

        // lists (FIX)
        technical_skills: toList(d.technical_skills),
        tools_used: toList(d.tools_used),
        domains: toList(d.domains),

        // strings fallback
        seniority_level: d.seniority_level || "Not specified",
        country: d.country || "Not specified",
        source: d.source || "N/A",
        title: d.title || d.job_title || "Untitled",
        company: d.company || "Unknown",
      }));

      console.log("Data processed. First item:", processedData[0]);

      // Tooltip unique
      const tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "d3-tooltip");

      // KPIs
      updateKPIs(processedData);

      // Charts
      createTechSkillsChart(
        processedData,
        "#viz-tech-skills",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      createSalaryHistogram(
        processedData,
        "#viz-salary-dist",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      createTopToolsChart(
        processedData,
        "#viz-tools",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      createGeoChart(
        processedData,
        "#viz-geo",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      createDomainsChart(
        processedData,
        "#viz-domains",
        tooltip,
        COLOR_ACCENT,
        COLOR_ACCENT_HOVER
      );

      // Pie charts
      createSeniorityChart(processedData, "#viz-seniority", tooltip);

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

      // Top titles / companies
      createTopTitles(processedData, "#chart-titles", tooltip);
      createTopCompanies(processedData, "#chart-companies", tooltip);

      setupModalListeners();

      console.log("All charts initialized.");
    })
    .catch((error) => {
      console.error(`Error loading data from ${dataPath}:`, error);
      alert(`Error: Could not load ${dataPath}. Check console.`);
    });

  // 2) KPIs
  function updateKPIs(data) {
    d3.select("#kpi-total-value").text(data.length);

    const uniqueCompanies = new Set(data.map((d) => d.company).filter(Boolean));
    d3.select("#kpi-total-companies").text(uniqueCompanies.size);

    const annualSalaries = data
      .filter(
        (d) =>
          d.salary_type === "annual" &&
          d.salary_currency === "USD" &&
          d.salary_value &&
          d.salary_value > 1000
      )
      .map((d) => d.salary_value);

    const medianSalary = d3.median(annualSalaries);
    d3.select("#kpi-median-salary").text(
      medianSalary ? `$${(medianSalary / 1000).toFixed(0)}k` : "N/A"
    );
  }

  // 3) Generic Bar Chart
  function createGenericBarChart(
    config,
    selector,
    tooltip,
    color,
    hoverColor,
    topN = 10
  ) {
    const aggregated = aggregateData(config.data, config.column, config.isList);

    const topData = aggregated
      .sort((a, b) => b.count - a.count)
      .slice(0, topN)
      .reverse();

    const vizElement = d3.select(selector);
    if (vizElement.empty()) return;
    vizElement.html("");

    const margin = { top: 10, right: 30, bottom: 40, left: 120 };
    const bbox = vizElement.node().getBoundingClientRect();

    const width = bbox.width - margin.left - margin.right;
    const height = bbox.height - margin.top - margin.bottom;
    if (width <= 0 || height <= 0) return;

    const svg = vizElement
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right} ${
          height + margin.top + margin.bottom
        }`
      )
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const y = d3
      .scaleBand()
      .domain(topData.map((d) => d.name))
      .range([height, 0])
      .padding(0.1);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(topData, (d) => d.count) || 1])
      .range([0, width]);

    svg
      .append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).tickSize(0))
      .select(".domain")
      .remove();

    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks(5));

    svg
      .selectAll(".bar")
      .data(topData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("y", (d) => y(d.name))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("fill", color)
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill", hoverColor);
        showTooltip(event, `<b>${d.name}</b><br>${d.count} mentions`, tooltip);
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill", color);
        hideTooltip(tooltip);
      })
      .transition()
      .duration(800)
      .attr("width", (d) => x(d.count));
  }

  function createTechSkillsChart(data, selector, tooltip, color, hoverColor) {
    createGenericBarChart(
      { data, column: "technical_skills", isList: true },
      selector,
      tooltip,
      color,
      hoverColor
    );
  }

  function createTopToolsChart(data, selector, tooltip, color, hoverColor) {
    createGenericBarChart(
      { data, column: "tools_used", isList: true },
      selector,
      tooltip,
      color,
      hoverColor
    );
  }

  function createGeoChart(data, selector, tooltip, color, hoverColor) {
    createGenericBarChart(
      { data, column: "country", isList: false },
      selector,
      tooltip,
      color,
      hoverColor
    );
  }

  function createDomainsChart(data, selector, tooltip, color, hoverColor) {
    createGenericBarChart(
      { data, column: "domains", isList: true },
      selector,
      tooltip,
      color,
      hoverColor
    );
  }

  // 4) Salary Histogram
  function createSalaryHistogram(data, selector, tooltip, color, hoverColor) {
    const annualSalaries = data
      .filter(
        (d) =>
          d.salary_type === "annual" &&
          d.salary_currency === "USD" &&
          d.salary_value &&
          d.salary_value > 20000 &&
          d.salary_value < 500000
      )
      .map((d) => d.salary_value);

    const vizElement = d3.select(selector);
    if (vizElement.empty()) return;
    vizElement.html("");

    const margin = { top: 10, right: 30, bottom: 40, left: 50 };
    const bbox = vizElement.node().getBoundingClientRect();

    const width = bbox.width - margin.left - margin.right;
    const height = bbox.height - margin.top - margin.bottom;
    if (width <= 0 || height <= 0 || annualSalaries.length === 0) return;

    const svg = vizElement
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right} ${
          height + margin.top + margin.bottom
        }`
      )
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain(d3.extent(annualSalaries))
      .nice()
      .range([0, width]);

    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0, ${height})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(7)
          .tickFormat((d) => `$${Math.round(d / 1000)}k`)
      );

    const histogram = d3.bin().domain(x.domain()).thresholds(x.ticks(20));

    const bins = histogram(annualSalaries);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) || 1])
      .nice()
      .range([height, 0]);

    svg.append("g").attr("class", "axis").call(d3.axisLeft(y));

    svg
      .selectAll("rect")
      .data(bins)
      .enter()
      .append("rect")
      .attr("x", (d) => x(d.x0) + 1)
      .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("y", height)
      .attr("height", 0)
      .attr("fill", color)
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill", hoverColor);
        const content = `<b>$${Math.round(d.x0 / 1000)}k - $${Math.round(
          d.x1 / 1000
        )}k</b><br>${d.length} jobs`;
        showTooltip(event, content, tooltip);
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill", color);
        hideTooltip(tooltip);
      })
      .transition()
      .duration(800)
      .attr("y", (d) => y(d.length))
      .attr("height", (d) => height - y(d.length));
  }

  // 5) Pie charts
  function createGenericPieChart(
    pieInput,
    selector,
    tooltip,
    colorRange,
    innerRadius = 0.5
  ) {
    const vizElement = d3.select(selector);
    if (vizElement.empty()) return;
    vizElement.html("");

    const width = vizElement.node().getBoundingClientRect().width;
    const height = vizElement.node().getBoundingClientRect().height;
    const radius = Math.min(width, height) / 2;

    const svg = vizElement
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const color = d3
      .scaleOrdinal()
      .domain(pieInput.map((d) => d.name))
      .range(colorRange);

    const arc = d3
      .arc()
      .innerRadius(radius * innerRadius)
      .outerRadius(radius);

    const pie = d3
      .pie()
      .value((d) => d.value)
      .sort(null);
    const pieData = pie(pieInput);

    svg
      .selectAll("path")
      .data(pieData)
      .enter()
      .append("path")
      .attr("fill", (d) => color(d.data.name))
      .attr("stroke", COLOR_BG_BODY)
      .style("stroke-width", "2px")
      .on("mouseover", (event, d) => {
        const total = d3.sum(pieInput, (x) => x.value) || 1;
        const percent = ((d.data.value / total) * 100).toFixed(1);
        showTooltip(
          event,
          `<b>${d.data.name}</b><br>${d.data.value} jobs (${percent}%)`,
          tooltip
        );
      })
      .on("mouseout", () => hideTooltip(tooltip))
      .transition()
      .duration(800)
      .attrTween("d", (d) => {
        const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return (t) => arc(i(t));
      });

    createLegend(selector, pieInput, color);
  }

  function createPolicyPieChart(
    data,
    column,
    selector,
    tooltip,
    labels,
    colorRange
  ) {
    const trueCount = data.filter((d) => d[column] === true).length;
    const falseCount = data.length - trueCount;

    const pieData = [
      { name: labels[0], value: trueCount },
      { name: labels[1], value: falseCount },
    ];

    createGenericPieChart(pieData, selector, tooltip, colorRange);
  }

  function createSeniorityChart(data, selector, tooltip) {
    const aggregated = aggregateData(data, "seniority_level", false).sort(
      (a, b) => b.count - a.count
    );

    const top5 = aggregated
      .slice(0, 5)
      .map((d) => ({ name: d.name, value: d.count }));
    const otherCount = aggregated.slice(5).reduce((acc, d) => acc + d.count, 0);
    if (otherCount > 0) top5.push({ name: "Other", value: otherCount });

    const colorRange = [
      COLOR_ACCENT,
      COLOR_GRAY,
      "#888",
      "#666",
      "#444",
      COLOR_BG_DARK,
    ];
    createGenericPieChart(top5, selector, tooltip, colorRange, 0);
  }

  function createSourceChart(data, selector, tooltip, colorRange) {
    const aggregated = aggregateData(data, "source", false).sort(
      (a, b) => b.count - a.count
    );
    if (aggregated.length === 0) return;

    const top = aggregated[0];
    const otherCount = aggregated.slice(1).reduce((acc, d) => acc + d.count, 0);

    const pieData = [
      { name: top.name, value: top.count },
      { name: "Other", value: otherCount },
    ];

    createGenericPieChart(pieData, selector, tooltip, colorRange);
  }

  // 6) Top titles / companies
  function createTopTitles(data, selector, tooltip) {
    const host = d3.select(selector);
    if (host.empty()) return;
    host.html("");

    const margin = { top: 40, right: 30, bottom: 100, left: 140 };
    const width = 850 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const titles = Array.from(
      d3.rollup(
        data,
        (v) => v.length,
        (d) => d.title
      )
    )
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => d3.descending(a.count, b.count))
      .slice(0, 10);

    const svg = host
      .append("svg")
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right} ${
          height + margin.top + margin.bottom
        }`
      )
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(titles, (d) => d.count) || 1])
      .range([0, width]);
    const y = d3
      .scaleBand()
      .domain(titles.map((d) => d.title))
      .range([0, height])
      .padding(0.2);

    svg
      .selectAll("rect")
      .data(titles)
      .enter()
      .append("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.title))
      .attr("height", y.bandwidth())
      .attr("width", 0)
      .attr("fill", COLOR_ACCENT)
      .attr("opacity", 0.8)
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill", "pink");
        showTooltip(
          event,
          `<strong>${d.title}</strong><br>Offers: ${d.count}`,
          tooltip
        );
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill", COLOR_ACCENT);
        hideTooltip(tooltip);
      })
      .transition()
      .duration(1000)
      .attr("width", (d) => x(d.count));

    svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x));
  }

  function createTopCompanies(data, selector, tooltip) {
    const host = d3.select(selector);
    if (host.empty()) return;
    host.html("");

    const margin = { top: 40, right: 30, bottom: 100, left: 80 };
    const width = 850 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const companies = Array.from(
      d3.rollup(
        data,
        (v) => v.length,
        (d) => d.company
      )
    )
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => d3.descending(a.count, b.count))
      .slice(0, 10);

    const svg = host
      .append("svg")
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right} ${
          height + margin.top + margin.bottom
        }`
      )
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand()
      .domain(companies.map((d) => d.company))
      .range([0, width])
      .padding(0.2);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(companies, (d) => d.count) || 1])
      .range([height, 0]);

    svg
      .selectAll("rect")
      .data(companies)
      .enter()
      .append("rect")
      .attr("x", (d) => x(d.company))
      .attr("y", height)
      .attr("width", x.bandwidth())
      .attr("height", 0)
      .attr("fill", COLOR_ACCENT_HOVER)
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill", "pink");
        showTooltip(
          event,
          `<strong>${d.company}</strong><br>Offers: ${d.count}`,
          tooltip
        );
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill", COLOR_ACCENT_HOVER);
        hideTooltip(tooltip);
      })
      .transition()
      .duration(1000)
      .attr("y", (d) => y(d.count))
      .attr("height", (d) => height - y(d.count));

    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
  }

  // 7) Modal
  function setupModalListeners() {
    const modalBackdrop = d3.select("#chart-modal-backdrop");
    const modalTitle = d3.select("#chart-modal-title");
    const modalContainer = d3.select("#chart-modal-container");
    const modalCloseBtn = d3.select("#chart-modal-close");

    if (
      modalBackdrop.empty() ||
      modalContainer.empty() ||
      modalTitle.empty() ||
      modalCloseBtn.empty()
    ) {
      return;
    }

    d3.selectAll(".card.chart-card").on("click", function (event) {
      const card = d3.select(this);
      const title = card.select("h3").text();
      const svgToClone = card.select("svg").node();

      if (!svgToClone) return;

      const clonedSvg = svgToClone.cloneNode(true);
      modalContainer.html("");
      modalContainer.node().appendChild(clonedSvg);
      modalTitle.text(title);
      modalBackdrop.classed("hidden", false);
    });

    modalCloseBtn.on("click", hideModal);
    modalBackdrop.on("click", function (event) {
      if (event.target === this) hideModal();
    });

    function hideModal() {
      modalBackdrop.classed("hidden", true);
      modalContainer.html("");
    }
  }
});
