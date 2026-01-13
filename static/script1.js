console.log("script.js charged");
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
document.addEventListener("DOMContentLoaded", () => {
  const bubbleChartContainer = d3.select("#bubbleChart");

  if (bubbleChartContainer.empty()) {
    console.log("script.js: #bubbleChart not found");
    return;
  }

  console.log("script.js: #bubbleChart found, launching the chart.");
  const width = 900;
  const height = 600;
  const margin = { top: 40, right: 30, bottom: 120, left: 80 };

  const svg = bubbleChartContainer
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  d3.dsv(";", "clean_jobs.csv")
    .then((data) => {
      const grouped = d3.rollups(
        data,
        (v) => v.length,
        (d) => d.company
      );
      let companies = grouped.map(([company, count]) => ({ company, count }));
      companies = companies
        .sort((a, b) => d3.descending(a.count, b.count))
        .slice(0, 20);
    })
    .catch((error) => {
      console.error("script.js: Error loading or processing data:", error);
    });
});

const cursor = document.querySelector(".cursor");

if (cursor) {
  console.log("script.js: cursor found");
  document.addEventListener("mousemove", (e) => {
    cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });

  document
    .querySelectorAll("a, button, .job-card, input, .filter-item, label")
    .forEach((el) => {
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
} else {
  console.log("script.js: .cursor not found.");
}

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

const backToTop = document.getElementById("backToTop");

if (backToTop) {
  console.log("script.js: #backToTop found.");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      backToTop.style.display = "block";
    } else {
      backToTop.style.display = "none";
    }
  });
  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
} else {
  console.log("script.js: #backToTop not found.");
}
