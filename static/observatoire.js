document.addEventListener("DOMContentLoaded", () => {
  /* 0. CUSTOM CURSOR + BACK TO TOP*/
  const cursor = document.querySelector(".cursor");
  if (cursor) {
    document.addEventListener("mousemove", (e) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    });
  }

  const backToTop = document.getElementById("backToTop");
  if (backToTop) {
    window.addEventListener("scroll", () => {
      backToTop.style.display = window.scrollY > 400 ? "block" : "none";
    });

    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* 1. CONFIG & DATA*/
  const DATA_FILE = "/api/data";

  const TRACKED_TECH = [
    "sql",
    "python",
    "r",
    "excel",
    "tableau",
    "power bi",
    "powerbi",
    "looker",
    "looker studio",
    "snowflake",
    "bigquery",
    "redshift",
    "spark",
    "hadoop",
    "airflow",
    "dbt",
    "aws",
    "gcp",
    "azure",
    "saas",
    "llm",
    "generative ai",
    "machine learning",
  ];

  const MMW_SKILLS = [
    "sql",
    "python",
    "tableau",
    "power bi",
    "excel",
    "aws",
    "gcp",
    "snowflake",
    "dbt",
    "airflow",
  ];

  const parseDate = d3.timeParse("%Y-%m-%d");
  const parseDateAlt = d3.timeParse("%Y-%m-%dT%H:%M:%SZ");

  let allJobs = [];
  let filteredJobs = [];

  // World map cache
  let worldGeo = null;
  let worldGeoPromise = null;

  /*  2. HELPERS
/* ROLE CLASSIFIER */
  function classifyRole(titleRaw) {
    if (!titleRaw) return "Other data role";
    const t = titleRaw.toLowerCase();
    if (t.includes("analytics engineer")) return "Analytics Engineer";
    if (t.includes("engineer")) return "Data Engineer";
    if (t.includes("scientist")) return "Data Scientist";
    if (t.includes("analytics") || t.includes("analyst")) return "Data Analyst";
    if (t.includes("business intelligence") || t.includes("bi "))
      return "BI / Analytics";
    if (t.includes("machine learning") || t.includes("ml "))
      return "ML Engineer";
    return "Other data role";
  }

  /*SKILL PARSER  */
  function parseSkillList(value) {
    if (!value) return [];

    // Case 1 : value is already an array
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    }

    // Case 2 : fallback for string input
    return String(value)
      .split(/;|,|\|/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  /* ROW PARSER */
  function rowParser(d) {
    let date = null;
    if (d.date_posted) {
      date = parseDate(d.date_posted) || parseDateAlt(d.date_posted);
      if (!date && !isNaN(Date.parse(d.date_posted))) {
        date = new Date(d.date_posted);
      }
    }

    // Accepts strings OR arrays
    const techSkills = parseSkillList(d.technical_skills);
    const toolsUsed = parseSkillList(d.tools_used);
    const softSkills = parseSkillList(d.soft_skills);
    const domains = parseSkillList(d.domains);

    // Salary
    let salary = d.salary_value ? +d.salary_value : NaN;
    if (!isFinite(salary)) salary = NaN;

    // Experience
    let expYears = d.experience_years ? +d.experience_years : NaN;
    if (!isFinite(expYears)) expYears = NaN;

    // hybrid_policy is boolean, not string
    const hybrid =
      d.hybrid_policy === true ||
      String(d.hybrid_policy ?? "").toLowerCase() === "true" ||
      String(d.hybrid_policy ?? "").toLowerCase() === "hybrid" ||
      String(d.hybrid_policy ?? "").toLowerCase() === "remote";

    //  visa_sponsorship is boolean
    const visa =
      d.visa_sponsorship === true ||
      d.visa_sponsorship === "True" ||
      d.visa_sponsorship === "true" ||
      String(d.visa_sponsorship ?? "").toLowerCase() === "yes" ||
      String(d.visa_sponsorship ?? "").toLowerCase() === "true";

    return {
      ...d,
      _date: date,
      _month: date ? d3.timeMonth(date) : null,
      _role: classifyRole(d.title || d.job_title),

      // normalized lists
      _techSkills: techSkills,
      _toolsUsed: toolsUsed,
      _softSkills: softSkills,
      _domains: domains,

      // correct booleans
      _hybrid: hybrid,
      _visa: visa,

      _country: d.country || "Not specified",
      _salary: salary,
      _exp: expYears,
    };
  }
  function getUniqueValues(data, accessor) {
    const set = new Set();
    data.forEach((d) => {
      const v = accessor(d);
      if (Array.isArray(v)) {
        v.forEach((x) => x && set.add(x));
      } else if (v) {
        set.add(v);
      }
    });
    return Array.from(set).sort();
  }

  function getCheckedValues(container) {
    if (!container) return [];
    const checkedInputs = container.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    return Array.from(checkedInputs).map((input) => input.value);
  }

  /* 3. DOM SELECTORS */
  const filterInputs = {
    text: document.getElementById("filter-text"),
    salary: document.getElementById("filter-salary"),
    dateRange: document.getElementById("filter-date-range"),
    hybrid: document.getElementById("filter-hybrid"),
    visa: document.getElementById("filter-visa"),
  };
  const salaryValueLabel = document.getElementById("salary-value");

  const filterGroups = {
    country: document.getElementById("filter-country"),
    role: document.getElementById("filter-role"),
    seniority: document.getElementById("filter-seniority"),
    skillsChips: document.getElementById("filter-skills-chips"),
  };

  const resetFiltersBtn = document.getElementById("reset-filters");

  const roleSelect = document.getElementById("role-select");

  // Modal
  const modalBackdrop = document.getElementById("chart-modal-backdrop");
  const modalTitle = document.getElementById("chart-modal-title");
  const modalContainer = document.getElementById("chart-modal-container");
  const modalDescription = document.getElementById("chart-modal-description");
  const modalCloseBtn = document.getElementById("chart-modal-close");

  /* 4. DATA LOADING */
  fetch(DATA_FILE)
    .then((res) => res.json())
    .then((raw) => {
      const dataRaw = raw.map(rowParser);
      allJobs = dataRaw.filter((d) => d._date);
      console.log("Observatory data loaded:", allJobs.length);

      initFilters(allJobs);
      initMyMarketWorthModule();
      applyFilters();
      setupChartModal();
    })
    .catch((err) => {
      console.error("Error loading data:", err);
    });

  /* 5. FILTERS */
  let selectedSkillChips = new Set();

  function initFilters(data) {
    if (salaryValueLabel && filterInputs.salary) {
      salaryValueLabel.textContent = "$0k";
      filterInputs.salary.value = 0;
    }

    createCheckboxList(
      filterGroups.country,
      getUniqueValues(data, (d) => d._country)
    );
    createCheckboxList(
      filterGroups.role,
      getUniqueValues(data, (d) => d._role)
    );
    createCheckboxList(
      filterGroups.seniority,
      getUniqueValues(data, (d) => d.seniority_level || "Not specified")
    );

    initSkillChips(data);
    initRoleSelects(data);
    setupFilterListeners();
  }

  function createCheckboxList(container, values) {
    if (!container) return;
    container.innerHTML = "";
    if (!values.length) {
      container.innerHTML =
        '<em style="color:var(--muted); font-size:0.8rem;">No data</em>';
      return;
    }
    values.forEach((val) => {
      const item = document.createElement("div");
      item.className = "filter-item";
      const escaped = val.replace(/"/g, "&quot;");
      item.innerHTML = `
        <label>
          <input type="checkbox" value="${escaped}">
          <span>${val}</span>
        </label>
      `;
      container.appendChild(item);
    });
  }

  function initSkillChips(data) {
    const container = filterGroups.skillsChips;
    if (!container) return;
    container.innerHTML = "";
    selectedSkillChips.clear();

    const counts = new Map();
    data.forEach((d) => {
      d._techSkills.forEach((s) => {
        counts.set(s, (counts.get(s) || 0) + 1);
      });
    });

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([skill]) => skill);

    sorted.forEach((skill) => {
      const div = document.createElement("div");
      div.className = "chip";
      div.textContent = skill;
      div.dataset.skill = skill;
      div.addEventListener("click", () => {
        if (selectedSkillChips.has(skill)) {
          selectedSkillChips.delete(skill);
          div.classList.remove("active");
        } else {
          selectedSkillChips.add(skill);
          div.classList.add("active");
        }
        applyFilters();
      });
      container.appendChild(div);
    });
  }

  function initRoleSelects(data) {
    if (!roleSelect) return;
    const roles = Array.from(
      new Set(data.map((d) => d._role).filter(Boolean))
    ).sort();

    roleSelect.innerHTML = "";
    roles.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      roleSelect.appendChild(opt);
    });

    const defaultRole =
      roles.find((r) => r.includes("Analyst")) ||
      roles.find((r) => r.includes("Engineer")) ||
      roles[0];
    if (defaultRole) roleSelect.value = defaultRole;
  }

  function setupFilterListeners() {
    Object.values(filterInputs).forEach((el) => {
      if (!el) return;
      const evt = el === filterInputs.text ? "input" : "change";
      el.addEventListener(evt, applyFilters);
    });

    if (filterInputs.salary && salaryValueLabel) {
      filterInputs.salary.addEventListener("input", (e) => {
        const valK = (e.target.value / 1000).toFixed(0);
        salaryValueLabel.textContent = `$${valK}k`;
      });
      filterInputs.salary.addEventListener("change", applyFilters);
    }

    [filterGroups.country, filterGroups.role, filterGroups.seniority].forEach(
      (group) => {
        if (!group) return;
        group.addEventListener("change", applyFilters);
      }
    );

    if (roleSelect) {
      roleSelect.addEventListener("change", () => {
        updateRoleDriftChart();
      });
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener("click", () => {
        if (filterInputs.text) filterInputs.text.value = "";
        if (filterInputs.salary) {
          filterInputs.salary.value = 0;
          if (salaryValueLabel) salaryValueLabel.textContent = "$0k";
        }
        if (filterInputs.dateRange) filterInputs.dateRange.value = "all";
        if (filterInputs.hybrid) filterInputs.hybrid.checked = false;
        if (filterInputs.visa) filterInputs.visa.checked = false;

        [
          filterGroups.country,
          filterGroups.role,
          filterGroups.seniority,
        ].forEach((group) => {
          if (!group) return;
          group
            .querySelectorAll('input[type="checkbox"]')
            .forEach((cb) => (cb.checked = false));
        });

        selectedSkillChips.clear();
        if (filterGroups.skillsChips) {
          filterGroups.skillsChips
            .querySelectorAll(".chip")
            .forEach((chip) => chip.classList.remove("active"));
        }

        applyFilters();
      });
    }
  }

  function applyFilters() {
    const text = filterInputs.text?.value.toLowerCase().trim() || "";
    const minSalary = filterInputs.salary ? +filterInputs.salary.value || 0 : 0;
    const dateRange = filterInputs.dateRange?.value || "all";
    const onlyHybrid = !!filterInputs.hybrid?.checked;
    const onlyVisa = !!filterInputs.visa?.checked;

    const selectedCountries = getCheckedValues(filterGroups.country);
    const selectedRoles = getCheckedValues(filterGroups.role);
    const selectedSeniorities = getCheckedValues(filterGroups.seniority);
    const selectedSkills = Array.from(selectedSkillChips);

    const now = d3.max(allJobs, (d) => d._date);
    let minDateFilter = null;
    if (now && dateRange === "30") {
      minDateFilter = d3.timeDay.offset(now, -30);
    } else if (now && dateRange === "60") {
      minDateFilter = d3.timeDay.offset(now, -60);
    }

    filteredJobs = allJobs.filter((job) => {
      if (minDateFilter && job._date && job._date < minDateFilter) {
        return false;
      }

      if (text) {
        const t =
          (job.title || "").toLowerCase() +
          " " +
          (job.description_sans_html || job.description || "").toLowerCase();
        if (!t.includes(text)) return false;
      }

      if (minSalary > 0) {
        if (!job._salary || job._salary < minSalary) return false;
      }

      if (onlyHybrid && !job._hybrid) return false;

      if (onlyVisa && !job._visa) return false;

      if (selectedCountries.length && !selectedCountries.includes(job._country))
        return false;

      if (selectedRoles.length && !selectedRoles.includes(job._role))
        return false;

      const sLevel = job.seniority_level || "Not specified";
      if (selectedSeniorities.length && !selectedSeniorities.includes(sLevel))
        return false;

      if (selectedSkills.length) {
        const skillSet = new Set(job._techSkills);
        const ok = selectedSkills.every((s) => skillSet.has(s));
        if (!ok) return false;
      }

      return true;
    });

    computeGlobalKPIs();
    updateJobVolumeChart();
    updateRoleDriftChart();
    updateSoftSkillDriftChart();
    updateMyMarketWorthChart();
    updateWorldMapChart();
  }

  /* 6. KPIs */
  function computeGlobalKPIs() {
    const data = filteredJobs.length ? filteredJobs : allJobs;
    if (!data.length) return;

    const now = d3.max(data, (d) => d._date);
    if (!now) return;

    const last30 = data.filter((d) => now - d._date <= 30 * 24 * 3600 * 1000);
    const prev30 = data.filter(
      (d) =>
        now - d._date > 30 * 24 * 3600 * 1000 &&
        now - d._date <= 60 * 24 * 3600 * 1000
    );

    const totalLast = last30.length;
    const totalPrev = prev30.length || 1;
    const delta = ((totalLast - totalPrev) / totalPrev) * 100;

    const totalJobsEl = document.getElementById("kpi-total-jobs");
    const deltaEl = document.getElementById("kpi-total-jobs-delta");
    if (totalJobsEl) totalJobsEl.textContent = totalLast.toLocaleString();
    if (deltaEl) {
      const deltaRounded = Math.round(delta);
      deltaEl.textContent =
        (deltaRounded > 0 ? "+" : "") + deltaRounded + "% vs prev.";
      deltaEl.className =
        "kpi-delta " + (deltaRounded >= 0 ? "positive" : "negative");
    }

    const roleCounts = d3.rollup(
      last30,
      (v) => v.length,
      (d) => d._role
    );
    const bestRole = Array.from(roleCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0];
    const hottestRoleEl = document.getElementById("kpi-hottest-role");
    if (bestRole && hottestRoleEl) {
      hottestRoleEl.textContent = bestRole[0];
    }

    const countTech = (subset) =>
      d3.rollup(
        subset,
        (v) => v.length,
        (d) => {
          const skills = [...d._techSkills, ...d._toolsUsed];
          const set = new Set(skills);
          const found = TRACKED_TECH.filter((t) =>
            Array.from(set).some((s) => s.includes(t))
          );
          return found.join("|") || null;
        }
      );

    const techLast = countTech(last30);
    const techPrev = countTech(prev30);

    let bestTechName = "";
    let bestTechScore = -Infinity;

    for (const [k, v] of techLast.entries()) {
      if (!k) continue;
      const prev = techPrev.get(k) || 1;
      const growth = (v - prev) / prev;
      if (growth > bestTechScore && v >= 3) {
        bestTechScore = growth;
        bestTechName = k.split("|")[0];
      }
    }
    const hottestTechEl = document.getElementById("kpi-hottest-tech");
    if (hottestTechEl) {
      hottestTechEl.textContent = bestTechName || "–";
    }
  }

  /* 7. JOB VOLUME OVER TIME */
  function aggregateJobsByMonth(dataSubset) {
    const monthMap = new Map();
    dataSubset.forEach((d) => {
      if (!d._date) return;
      const mKey = d3.timeMonth(d._date).getTime();
      if (!monthMap.has(mKey)) {
        monthMap.set(mKey, {
          month: new Date(mKey),
          count: 0,
        });
      }
      monthMap.get(mKey).count += 1;
    });
    return Array.from(monthMap.values()).sort((a, b) => a.month - b.month);
  }

  function updateJobVolumeChart() {
    const container = document.getElementById("job-volume-container");
    const svg = d3.select("#job-volume-svg");
    if (!container || svg.empty()) return;

    svg.selectAll("*").remove();

    const dataAll = allJobs;
    if (!dataAll.length) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 260;
    const margin = { top: 10, right: 20, bottom: 28, left: 50 };

    svg.attr("viewBox", [0, 0, width, height]);

    const baseline = aggregateJobsByMonth(dataAll);
    const filtered = aggregateJobsByMonth(
      filteredJobs.length ? filteredJobs : dataAll
    );

    const allDates = baseline.map((d) => d.month);
    const xDomain =
      allDates.length > 0
        ? d3.extent(allDates)
        : [new Date(), new Date(new Date().getTime() + 86400000)];

    const x = d3
      .scaleTime()
      .domain(xDomain)
      .range([margin.left, width - margin.right]);

    const maxAll = d3.max(baseline, (d) => d.count) || 1;
    const maxFil = d3.max(filtered, (d) => d.count) || 1;
    const yMax = Math.max(maxAll, maxFil);

    const y = d3
      .scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b %Y"));
    const yAxis = d3.axisLeft(y).ticks(4);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .attr("class", "axis")
      .call(xAxis);

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .attr("class", "axis")
      .call(yAxis)
      .call((g) => g.select(".domain").remove());

    const line = d3
      .line()
      .x((d) => x(d.month))
      .y((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(baseline)
      .attr("fill", "none")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", 2)
      .attr("d", line)
      .attr("opacity", 0.9);

    svg
      .append("path")
      .datum(filtered)
      .attr("fill", "none")
      .attr("stroke", "#22d3ee")
      .attr("stroke-width", 2.4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("d", line)
      .attr("opacity", 0.95);

    const legend = svg
      .append("g")
      .attr("transform", `translate(${width - 170},${margin.top + 4})`);

    const legendItems = [
      { label: "All jobs (baseline)", color: "#4b5563" },
      { label: "Filtered jobs", color: "#22d3ee" },
    ];

    legendItems.forEach((item, i) => {
      const row = legend
        .append("g")
        .attr("transform", `translate(0,${i * 16})`);

      row
        .append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("rx", 2)
        .attr("ry", 2)
        .attr("fill", item.color);

      row
        .append("text")
        .attr("x", 16)
        .attr("y", 9)
        .text(item.label)
        .attr("fill", "#9ca3af")
        .style("font-size", "10px");
    });
  }

  /* 8. ROLE DRIFT*/
  function updateRoleDriftChart() {
    const container = document.getElementById("role-drift-container");
    const svg = d3.select("#role-drift-svg");
    const tooltip = d3.select("#role-drift-tooltip");
    const legendDiv = d3.select("#role-drift-legend");

    if (!container || svg.empty()) return;

    svg.selectAll("*").remove();
    legendDiv.selectAll("*").remove();

    const data = filteredJobs.length ? filteredJobs : allJobs;
    if (!data.length) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 260;
    const margin = { top: 20, right: 10, bottom: 26, left: 50 };

    svg.attr("viewBox", [0, 0, width, height]);

    const role = roleSelect && roleSelect.value ? roleSelect.value : null;
    const roleData = data.filter((d) => d._role === role && d._month);

    if (!roleData.length) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .text("No data for this role in the current filters.");
      return;
    }

    const months = Array.from(
      d3
        .rollup(
          roleData,
          (v) => v.length,
          (d) => +d._month
        )
        .keys()
    )
      .map((t) => new Date(t))
      .sort(d3.ascending);

    const maxMonths = 8;
    const selectedMonths =
      months.length > maxMonths ? months.slice(-maxMonths) : months;

    const records = [];
    const KEY_SKILLS = [
      "sql",
      "python",
      "tableau",
      "power bi",
      "powerbi",
      "excel",
      "snowflake",
      "dbt",
      "airflow",
      "spark",
      "aws",
      "gcp",
      "azure",
    ];

    roleData.forEach((job) => {
      const monthKey = +d3.timeMonth(job._date);
      if (!selectedMonths.some((m) => +m === monthKey)) return;

      const skillSet = new Set([...job._techSkills, ...job._toolsUsed]);
      KEY_SKILLS.forEach((skill) => {
        const matched = Array.from(skillSet).some((s) => s.includes(skill));
        if (matched) {
          records.push({
            month: new Date(monthKey),
            skill,
          });
        }
      });
    });

    if (!records.length) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .text("No tracked skills found for this role.");
      return;
    }

    const aggregated = d3.rollups(
      records,
      (v) => v.length,
      (d) => d.skill,
      (d) => +d.month
    );

    const series = aggregated.map(([skill, entries]) => {
      const map = new Map(entries);
      return {
        skill,
        values: selectedMonths.map((m) => ({
          month: m,
          count: map.get(+m) || 0,
        })),
      };
    });

    const ranked = series
      .map((s) => ({
        ...s,
        total: d3.sum(s.values, (v) => v.count),
      }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    if (!ranked.length) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .text("Not enough signal to show evolution.");
      return;
    }

    const x = d3
      .scaleTime()
      .domain(d3.extent(selectedMonths))
      .range([margin.left, width - margin.right]);

    const maxCount = d3.max(ranked, (s) => d3.max(s.values, (v) => v.count));
    const y = d3
      .scaleLinear()
      .domain([0, maxCount || 1])
      .nice()
      .range([height - margin.bottom, margin.top + 10]);

    const color = d3
      .scaleOrdinal()
      .domain(ranked.map((d) => d.skill))
      .range([
        "#22d3ee",
        "#a855f7",
        "#f97316",
        "#4ade80",
        "#facc15",
        "#38bdf8",
      ]);

    const xAxis = d3
      .axisBottom(x)
      .ticks(selectedMonths.length)
      .tickFormat(d3.timeFormat("%b %y"));
    const yAxis = d3
      .axisLeft(y)
      .ticks(4)
      .tickSize(-width + margin.left + margin.right);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .attr("class", "axis")
      .call(xAxis);

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .attr("class", "axis")
      .call(yAxis)
      .call((g) => g.selectAll(".tick line").attr("stroke-dasharray", "2,2"))
      .call((g) => g.select(".domain").remove());

    const line = d3
      .line()
      .x((d) => x(d.month))
      .y((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    svg
      .selectAll(".skill-line")
      .data(ranked)
      .join("g")
      .attr("class", "skill-line")
      .append("path")
      .attr("fill", "none")
      .attr("stroke-width", 2)
      .attr("stroke", (d) => color(d.skill))
      .attr("d", (d) => line(d.values))
      .attr("opacity", 0.9);

    ranked.forEach((s) => {
      const cls = s.skill.replace(/\s+/g, "-");
      svg
        .selectAll(`.point-${cls}`)
        .data(s.values)
        .join("circle")
        .attr("class", `point-${cls}`)
        .attr("cx", (d) => x(d.month))
        .attr("cy", (d) => y(d.count))
        .attr("r", 3)
        .attr("fill", color(s.skill))
        .on("mouseenter", (event, dVal) => {
          tooltip
            .style("opacity", 1)
            .style("left", event.offsetX + 14 + "px")
            .style("top", event.offsetY - 8 + "px")
            .html(
              `<strong>${s.skill}</strong><br>${d3.timeFormat("%B %Y")(
                dVal.month
              )}<br>${dVal.count} offer(s)`
            );
        })
        .on("mouseleave", () => {
          tooltip.style("opacity", 0);
        });
    });

    const legendItems = legendDiv
      .selectAll(".legend-item")
      .data(ranked)
      .join("div")
      .attr("class", "legend-item");

    legendItems
      .append("div")
      .attr("class", "legend-swatch")
      .style("background", (d) => color(d.skill));

    legendItems
      .append("span")
      .text((d) => `${d.skill} · ${d.total} mention(s)`);
  }

  /* 9. GENERIC DRIFT CHART (soft skills & domains) */
  function genericDriftChart({
    idPrefix,
    accessor,
    titleAccessor,
    minCount,
    maxSeries,
  }) {
    const container = document.getElementById(`${idPrefix}-container`);
    const svg = d3.select(`#${idPrefix}-svg`);
    const tooltip = d3.select(`#${idPrefix}-tooltip`);
    const legendDiv = d3.select(`#${idPrefix}-legend`);

    if (!container || svg.empty()) return;

    svg.selectAll("*").remove();
    legendDiv.selectAll("*").remove();

    const data = filteredJobs.length ? filteredJobs : allJobs;
    if (!data.length) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 260;
    const margin = { top: 20, right: 10, bottom: 26, left: 50 };

    svg.attr("viewBox", [0, 0, width, height]);

    const monthSet = new Set();
    data.forEach((d) => {
      if (d._month) monthSet.add(+d._month);
    });
    const months = Array.from(monthSet)
      .map((t) => new Date(t))
      .sort(d3.ascending);

    if (!months.length) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .text("No temporal signal in the current filters.");
      return;
    }

    const maxMonths = 8;
    const selectedMonths =
      months.length > maxMonths ? months.slice(-maxMonths) : months;

    const records = [];
    data.forEach((d) => {
      if (!d._month) return;
      const monthKey = +d._month;
      if (!selectedMonths.some((m) => +m === monthKey)) return;
      const values = accessor(d) || [];
      const unique = new Set(values);
      unique.forEach((val) => {
        if (val) {
          records.push({
            month: new Date(monthKey),
            item: val,
          });
        }
      });
    });

    if (!records.length) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .text("Not enough signal to show evolution.");
      return;
    }

    const aggregated = d3.rollups(
      records,
      (v) => v.length,
      (d) => d.item,
      (d) => +d.month
    );

    const series = aggregated.map(([item, entries]) => {
      const map = new Map(entries);
      return {
        item,
        values: selectedMonths.map((m) => ({
          month: m,
          count: map.get(+m) || 0,
        })),
      };
    });

    const ranked = series
      .map((s) => ({
        ...s,
        total: d3.sum(s.values, (v) => v.count),
      }))
      .filter((s) => s.total >= minCount)
      .sort((a, b) => b.total - a.total)
      .slice(0, maxSeries);

    if (!ranked.length) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .text("Not enough signal to show evolution.");
      return;
    }

    const x = d3
      .scaleTime()
      .domain(d3.extent(selectedMonths))
      .range([margin.left, width - margin.right]);

    const maxCount = d3.max(ranked, (s) => d3.max(s.values, (v) => v.count));
    const y = d3
      .scaleLinear()
      .domain([0, maxCount || 1])
      .nice()
      .range([height - margin.bottom, margin.top + 10]);

    const color = d3
      .scaleOrdinal()
      .domain(ranked.map((d) => d.item))
      .range([
        "#22d3ee",
        "#a855f7",
        "#f97316",
        "#4ade80",
        "#facc15",
        "#38bdf8",
      ]);

    const xAxis = d3
      .axisBottom(x)
      .ticks(selectedMonths.length)
      .tickFormat(d3.timeFormat("%b %y"));
    const yAxis = d3
      .axisLeft(y)
      .ticks(4)
      .tickSize(-width + margin.left + margin.right);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .attr("class", "axis")
      .call(xAxis);

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .attr("class", "axis")
      .call(yAxis)
      .call((g) => g.selectAll(".tick line").attr("stroke-dasharray", "2,2"))
      .call((g) => g.select(".domain").remove());

    const line = d3
      .line()
      .x((d) => x(d.month))
      .y((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    svg
      .selectAll(".item-line")
      .data(ranked)
      .join("g")
      .attr("class", "item-line")
      .append("path")
      .attr("fill", "none")
      .attr("stroke-width", 2)
      .attr("stroke", (d) => color(d.item))
      .attr("d", (d) => line(d.values))
      .attr("opacity", 0.9);

    ranked.forEach((s) => {
      const cls = s.item.replace(/\s+/g, "-");
      svg
        .selectAll(`.point-${cls}`)
        .data(s.values)
        .join("circle")
        .attr("class", `point-${cls}`)
        .attr("cx", (d) => x(d.month))
        .attr("cy", (d) => y(d.count))
        .attr("r", 3)
        .attr("fill", color(s.item))
        .on("mouseenter", (event, dVal) => {
          tooltip
            .style("opacity", 1)
            .style("left", event.offsetX + 14 + "px")
            .style("top", event.offsetY - 8 + "px")
            .html(
              `<strong>${titleAccessor(s.item)}</strong><br>${d3.timeFormat(
                "%B %Y"
              )(dVal.month)}<br>${dVal.count} offer(s)`
            );
        })
        .on("mouseleave", () => {
          tooltip.style("opacity", 0);
        });
    });

    const legendItems = legendDiv
      .selectAll(".legend-item")
      .data(ranked)
      .join("div")
      .attr("class", "legend-item");

    legendItems
      .append("div")
      .attr("class", "legend-swatch")
      .style("background", (d) => color(d.item));

    legendItems
      .append("span")
      .text((d) => `${titleAccessor(d.item)} · ${d.total} mention(s)`);
  }

  function updateSoftSkillDriftChart() {
    genericDriftChart({
      idPrefix: "soft-drift",
      accessor: (d) => d._softSkills,
      titleAccessor: (s) => s,
      minCount: 3,
      maxSeries: 6,
    });
  }

  /* 10. MY MARKET WORTH */
  let mmwSelectedSkills = new Set();

  function initMyMarketWorthModule() {
    const chipsContainer = document.getElementById("mmw-skill-chips");
    const expSelect = document.getElementById("mmw-experience");

    if (!chipsContainer) return;
    chipsContainer.innerHTML = "";
    mmwSelectedSkills.clear();

    MMW_SKILLS.forEach((skill) => {
      const div = document.createElement("div");
      div.className = "chip";
      div.textContent = skill;
      div.dataset.skill = skill;
      div.addEventListener("click", () => {
        if (mmwSelectedSkills.has(skill)) {
          mmwSelectedSkills.delete(skill);
          div.classList.remove("active");
        } else {
          mmwSelectedSkills.add(skill);
          div.classList.add("active");
        }
        updateMyMarketWorthChart();
      });
      chipsContainer.appendChild(div);
    });

    if (expSelect) {
      expSelect.addEventListener("change", () => {
        updateMyMarketWorthChart();
      });
    }
  }

  function updateMyMarketWorthChart() {
    const svg = d3.select("#mmw-svg");
    const tooltip = d3.select("#mmw-tooltip");
    const container = document.getElementById("mmw-container");
    const expSelect = document.getElementById("mmw-experience");
    const output = document.getElementById("mmw-output");
    const extra = document.getElementById("mmw-extra");

    svg.selectAll("*").remove();
    if (extra) extra.textContent = "";

    const data = filteredJobs.length ? filteredJobs : allJobs;
    if (!data.length || !output) return;

    const selectedSkills = Array.from(mmwSelectedSkills);
    const expLevel = expSelect ? +expSelect.value : 0;

    if (!selectedSkills.length) {
      output.innerHTML =
        "Select some skills to see your estimated worth inside this dataset.";
      return;
    }

    const scored = data.map((d) => {
      const jobSkills = new Set([...d._techSkills, ...d._toolsUsed]);
      let matchCount = 0;
      selectedSkills.forEach((s) => {
        if (Array.from(jobSkills).some((js) => js.includes(s))) {
          matchCount++;
        }
      });
      const skillScore = matchCount / selectedSkills.length;

      let expScore = 1;
      if (!isNaN(d._exp)) {
        if (expLevel === 0 && d._exp <= 1) expScore = 1.1;
        else if (expLevel === 2 && d._exp >= 2 && d._exp <= 4) expScore = 1.1;
        else if (expLevel === 5 && d._exp >= 5) expScore = 1.1;
        else expScore = 0.8;
      }

      return {
        job: d,
        score: skillScore * expScore,
      };
    });

    const filtered = scored.filter((s) => s.score > 0.3);
    const totalOffers = data.length;
    const matchingOffers = filtered.length;

    if (!matchingOffers) {
      output.innerHTML =
        "We couldn't find offers close enough to your stack in the current filters.";
      return;
    }

    const perc = (matchingOffers / totalOffers) * 100;
    const salaries = filtered
      .map((d) => d.job._salary)
      .filter((s) => s && isFinite(s));
    const medianSalary = salaries.length ? d3.median(salaries) : NaN;

    output.innerHTML =
      `Based on the current filters, <span>${matchingOffers.toLocaleString()}</span>` +
      ` offers match your skill stack (${perc.toFixed(
        1
      )}% of all filtered offers).<br>` +
      (medianSalary
        ? `Estimated median salary for similar profiles: <span>$${Math.round(
            medianSalary
          ).toLocaleString()}</span>.`
        : "No reliable salary information for these offers yet.");

    if (!salaries.length || salaries.length < 5 || !container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 260;
    const margin = { top: 16, right: 16, bottom: 26, left: 50 };

    svg.attr("viewBox", [0, 0, width, height]);

    const x = d3
      .scaleLinear()
      .domain(d3.extent(salaries))
      .nice()
      .range([margin.left, width - margin.right]);

    const bins = d3.bin().domain(x.domain()).thresholds(10)(salaries);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) || 1])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const xAxis = d3
      .axisBottom(x)
      .ticks(5)
      .tickFormat((d) =>
        d >= 1000 ? "$" + Math.round(d / 1000) + "k" : "$" + Math.round(d)
      );
    const yAxis = d3.axisLeft(y).ticks(4);

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .attr("class", "axis")
      .call(xAxis);

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .attr("class", "axis")
      .call(yAxis)
      .call((g) => g.select(".domain").remove());

    const bar = svg.selectAll(".bar").data(bins).join("g").attr("class", "bar");

    bar
      .append("rect")
      .attr("x", (d) => x(d.x0) + 1)
      .attr("y", (d) => y(d.length))
      .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("height", (d) => y(0) - y(d.length))
      .attr("fill", "rgba(34,211,238,0.6)")
      .on("mouseenter", (event, d) => {
        tooltip
          .style("opacity", 1)
          .style("left", event.offsetX + 10 + "px")
          .style("top", event.offsetY - 8 + "px")
          .html(
            `<strong>${d.length} offer(s)</strong><br>` +
              `Salary range: $${Math.round(
                d.x0
              ).toLocaleString()}–$${Math.round(d.x1).toLocaleString()}`
          );
      })
      .on("mouseleave", () => {
        tooltip.style("opacity", 0);
      });

    if (medianSalary) {
      svg
        .append("line")
        .attr("x1", x(medianSalary))
        .attr("x2", x(medianSalary))
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#f97316")
        .attr("stroke-dasharray", "4,2")
        .attr("stroke-width", 1.5);

      svg
        .append("text")
        .attr("x", x(medianSalary))
        .attr("y", margin.top - 4)
        .attr("text-anchor", "middle")
        .attr("fill", "#f97316")
        .attr("font-size", 10)
        .text("Median");
    }

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 4)
      .attr("text-anchor", "middle")
      .attr("fill", "#6b7280")
      .attr("font-size", 10)
      .text("Salary distribution for offers similar to your profile");

    if (extra) {
      extra.textContent =
        "This is an approximate, dataset-based view — not a salary promise. The more complete your dataset, the more reliable this estimate becomes.";
    }
  }

  /* 11. WORLD MAP */
  function updateWorldMapChart() {
    const container = document.getElementById("worldmap-container");
    const svg = d3.select("#worldmap-svg");
    const tooltip = d3.select("#worldmap-tooltip");
    if (!container || svg.empty()) return;

    svg.selectAll("*").remove();
    if (!tooltip.empty()) tooltip.style("opacity", 0);

    const data = filteredJobs.length ? filteredJobs : allJobs;
    if (!data.length) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 260;
    const margin = { top: 10, right: 10, bottom: 10, left: 10 };

    svg.attr("viewBox", [0, 0, width, height]);

    const countryCounts = d3.rollups(
      data,
      (v) => v.length,
      (d) => (d._country || "Not specified").trim()
    );
    const countMap = new Map(countryCounts);

    function ensureWorldGeo(callback) {
      if (worldGeo) {
        callback();
        return;
      }
      if (!worldGeoPromise) {
        worldGeoPromise = d3
          .json("https://unpkg.com/world-atlas@2/countries-110m.json")
          .then((raw) => {
            worldGeo = topojson.feature(raw, raw.objects.countries);
          })
          .catch((err) => console.error("World map load error:", err));
      }
      worldGeoPromise.then(callback);
    }

    ensureWorldGeo(() => {
      if (!worldGeo) return;

      const projection = d3
        .geoNaturalEarth1()
        .fitSize(
          [
            width - margin.left - margin.right,
            height - margin.top - margin.bottom,
          ],
          worldGeo
        );
      const path = d3.geoPath(projection);

      svg
        .append("g")
        .selectAll("path")
        .data(worldGeo.features)
        .join("path")
        .attr("d", path)
        .attr("fill", "#020617")
        .attr("stroke", "#1f2937")
        .attr("stroke-width", 0.6);

      const points = worldGeo.features
        .map((f) => {
          const name = f.properties.name;
          const count = countMap.get(name) || 0;
          if (!count) return null;
          const centroid = path.centroid(f);
          return { name, count, x: centroid[0], y: centroid[1] };
        })
        .filter(Boolean);

      if (!points.length) {
        svg
          .append("text")
          .attr("x", width / 2)
          .attr("y", height / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#6b7280")
          .text("No country-level information in the current filters.");
        return;
      }

      const maxCount = d3.max(points, (d) => d.count) || 1;
      const r = d3.scaleSqrt().domain([1, maxCount]).range([3, 22]);

      svg
        .append("g")
        .selectAll("circle")
        .data(points)
        .join("circle")
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y)
        .attr("r", (d) => r(d.count))
        .attr("fill", "rgba(34,211,238,0.7)")
        .attr("stroke", "#0f172a")
        .attr("stroke-width", 1)
        .on("mouseenter", (event, d) => {
          tooltip
            .style("opacity", 1)
            .style("left", event.offsetX + 10 + "px")
            .style("top", event.offsetY - 8 + "px")
            .html(
              `<strong>${
                d.name
              }</strong><br>${d.count.toLocaleString()} offer(s)`
            );
        })
        .on("mouseleave", () => {
          tooltip.style("opacity", 0);
        });
    });
  }

  /* 12. CHART MODAL */
  function setupChartModal() {
    const cards = document.querySelectorAll(".chart-card");
    cards.forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.tagName.toLowerCase() === "select") return;

        const title = card.querySelector("h3")?.textContent || "";
        const svg = card.querySelector("svg");
        const subtitle =
          card.querySelector(".chart-subtitle")?.textContent || "";

        if (!svg || !modalBackdrop || !modalContainer) return;

        modalContainer.innerHTML = "";
        const cloned = svg.cloneNode(true);
        modalContainer.appendChild(cloned);

        if (modalTitle) modalTitle.textContent = title;
        if (modalDescription) modalDescription.textContent = subtitle;

        modalBackdrop.classList.remove("hidden");
      });
    });

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener("click", hideModal);
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener("click", (e) => {
        if (e.target === modalBackdrop) hideModal();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        modalBackdrop &&
        !modalBackdrop.classList.contains("hidden")
      ) {
        hideModal();
      }
    });
  }

  function hideModal() {
    if (!modalBackdrop || !modalContainer || !modalDescription) return;
    modalBackdrop.classList.add("hidden");
    modalContainer.innerHTML = "";
    modalDescription.textContent = "";
  }
});
