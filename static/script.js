// Reveal on scroll
const revealSections = () => {
  document.querySelectorAll("section").forEach((sec) => {
    const rect = sec.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      sec.classList.add("reveal");
    }
  });
};
window.addEventListener("scroll", revealSections);
revealSections();

// Reveal on scroll
const revealCards = () => {
  document.querySelectorAll(".card").forEach((card) => {
    const rect = card.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      card.classList.add("reveal");
    }
  });
};
window.addEventListener("scroll", revealCards);
revealCards();

document.addEventListener("DOMContentLoaded", () => {
  // 1) BAR CHART: TOP COMPANIES
  const chartHost = document.getElementById("bubbleChart");
  if (!chartHost) {
    console.warn("Missing #bubbleChart in startup.html — chart not rendered.");
  } else {
    const width = 900;
    const height = 600;
    const margin = { top: 40, right: 30, bottom: 120, left: 80 };

    const svg = d3
      .select(chartHost)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("background", "rgba(241, 6, 163, 0.9)")
      .style("padding", "6px 10px")
      .style("border-radius", "8px")
      .style("box-shadow", "0 2px 10px rgba(0,0,0,0.2)")
      .style("pointer-events", "none")
      .style("opacity", 0);

    fetch("/api/jobs")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} on /api/jobs`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || !data.length) {
          console.warn("No data returned from /api/jobs");
          return;
        }

        console.log("Sample job:", data[0]);

        // Group by company
        const grouped = d3.rollups(
          data,
          (v) => v.length,
          (d) =>
            d.company && String(d.company).trim()
              ? String(d.company).trim()
              : "Unknown"
        );

        // Convert to objects + keep top 20
        let companies = grouped.map(([company, count]) => ({ company, count }));
        companies = companies
          .sort((a, b) => d3.descending(a.count, b.count))
          .slice(0, 20);

        // Scales
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const x = d3
          .scaleBand()
          .domain(companies.map((d) => d.company))
          .range([0, innerW])
          .padding(0.2);

        const y = d3
          .scaleLinear()
          .domain([0, d3.max(companies, (d) => d.count) || 1])
          .nice()
          .range([innerH, 0]);

        // Axes
        svg
          .append("g")
          .attr("transform", `translate(0,${innerH})`)
          .call(d3.axisBottom(x))
          .selectAll("text")
          .attr("transform", "rotate(-45)")
          .style("text-anchor", "end")
          .style("font-size", "10px");

        svg.append("g").call(d3.axisLeft(y));

        // Bars
        svg
          .selectAll("rect")
          .data(companies)
          .enter()
          .append("rect")
          .attr("x", (d) => x(d.company))
          .attr("y", (d) => y(d.count))
          .attr("width", x.bandwidth())
          .attr("height", (d) => y(0) - y(d.count))
          .attr("fill", "cyan")
          .attr("opacity", 0.8)
          .on("mouseover", function (e, d) {
            d3.select(this).attr("fill", "#FF69B4");
            tooltip
              .style("opacity", 1)
              .html(`<strong>${d.company}</strong><br>Offres : ${d.count}`);
          })
          .on("mousemove", (e) => {
            tooltip.style("left", e.pageX + 10 + "px");
            tooltip.style("top", e.pageY - 20 + "px");
          })
          .on("mouseout", function () {
            d3.select(this).attr("fill", "cyan");
            tooltip.style("opacity", 0);
          });

        // Y label
        svg
          .append("text")
          .attr("x", -innerH / 2)
          .attr("y", -50)
          .attr("transform", "rotate(-90)")
          .style("text-anchor", "middle")
          .style("fill", "cyan")
          .text("Number of offers");
      })
      .catch((err) => {
        console.error("Error loading /api/jobs:", err);
      });
  }

  // 2) CUSTOM CURSOR
  const cursor = document.querySelector(".cursor");
  if (cursor) {
    document.addEventListener("mousemove", (e) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    });

    // Hover grow on links/buttons
    document.querySelectorAll("a, button").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        cursor.style.transform += " scale(1.8)";
      });
      el.addEventListener("mouseleave", () => {
        cursor.style.transform = cursor.style.transform.replace(
          " scale(1.8)",
          ""
        );
      });
    });
  }

  // 3) BACK TO TOP (guarded)
  const backToTop = document.getElementById("backToTop");
  if (backToTop) {
    window.addEventListener("scroll", () => {
      backToTop.style.display = window.scrollY > 300 ? "block" : "none";
    });

    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});
