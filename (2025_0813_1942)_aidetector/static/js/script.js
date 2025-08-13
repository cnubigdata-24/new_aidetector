// 국사 클릭 시 토폴로지 맵 호출
document.querySelectorAll('#kuksa-list li').forEach(item => {
  item.addEventListener('click', () => {
      const kuksaName = item.textContent.trim();
      fetch(`/api/topology/${kuksaName}`)
          .then(res => res.json())
          .then(data => {
              drawTopology(data);
          });
  });
});

function drawTopology(data) {
  const svg = d3.select("#topology-svg");
  svg.selectAll("*").remove(); // 초기화

  const width = +svg.attr("width");
  const height = +svg.attr("height");

  const centerX = width / 2;
  const centerY = height / 2;

  const nodeRadius = 40;

  const nodes = [];
  const links = [];

  // 중앙 노드
  nodes.push({
      id: data.center,
      type: "center"
  });

  // 상위국
  data.upper.forEach((link, i) => {
      nodes.push({
          id: link.remote_kuksa_name,
          type: "upper"
      });
      links.push({
          source: link.remote_kuksa_name,
          target: data.center,
          link_type: link.link_type
      });
  });

  // 하위국
  data.lower.forEach((link, i) => {
      nodes.push({
          id: link.remote_kuksa_name,
          type: "lower"
      });
      links.push({
          source: data.center,
          target: link.remote_kuksa_name,
          link_type: link.link_type
      });
  });

  const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(200))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(centerX, centerY))
      .on("tick", ticked);

  const link = svg.append("g")
      .attr("stroke", "#aaa")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

  const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", nodeRadius)
      .attr("fill", d => d.type === "center" ? "red" : d.type === "upper" ? "#1f77b4" : "#2ca02c")
      .call(drag(simulation));

  const label = svg.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text(d => d.id)
      .attr("font-size", 12)
      .attr("text-anchor", "middle")
      .attr("dy", 5);

  function ticked() {
      link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

      node
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);

      label
          .attr("x", d => d.x)
          .attr("y", d => d.y);
  }

  function drag(simulation) {
      return d3.drag()
          .on("start", (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
          })
          .on("drag", (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
          })
          .on("end", (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
          });
  }
}
