"use strict";

/* ---------- Config ---------- */
const DATA_URL = "./decks.json";
const WIN_WEIGHT = 1;
const LOSS_WEIGHT = 0.5;
const COLORS = { Normal: "#75A7FF", Evo: "#9B70F5", Hero: "#FFBD69" };

const $ = id => document.getElementById(id);

/* ---------- State ---------- */
let DECKS = [];
let selectedNode = null;
let selectedPlayers = new Set();
const nodesDS = new vis.DataSet([]);
const edgesDS = new vis.DataSet([]);

const network = new vis.Network($("network"), { nodes: nodesDS, edges: edgesDS }, 
  {
    interaction: { hover: true, navigationButtons: false, keyboard: true, dragNodes: true, 
      hideEdgesOnDrag: false, hideNodesOnDrag: false, selectConnectedEdges: false },
    physics: { enabled: true, solver: "repulsion",
      repulsion: { centralGravity: 0.06, damping: 0.35, nodeDistance: 300, 
        springConstant: 0.025, springLength: 160 },
      stabilization: { enabled: true, iterations: 300, fit: true, updateInterval: 25}
    },
    nodes: { shape: "image", scaling: { min: 20, max: 55 }, 
      borderWidth: 2, brokenImage: "./assets/placeholder.png" },
    edges: { smooth: { type: "dynamic" }, selectionWidth: 0, hoverWidth: 1,
      color: {
        color: "rgba(148, 167, 202, .34)",
        highlight: "rgba(148, 167, 202, .55)",
        hover: "rgba(148, 167, 202, .55)",
        inherit: false
      }
    }
  }
);

/* ---------- Helpers ---------- */
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
));

function parseCard(name) {
  const match = name.match(/^(Evo|Hero)\s+(.+)$/);
  return match ? { base: match[2].trim(), variant: match[1] } : { base: name.trim(), variant: "Normal" };
}

const cardKey = (name, separateEvo, separateHero) => {
  const { base, variant } = parseCard(name);

  if (variant === "Evo" && separateEvo) return name.trim();
  if (variant === "Hero" && separateHero) return name.trim();

  return base;
};

function getFilters() {
  return {
    outcome: $("outcome").value,
    separateEvo: $("separateEvo").checked,
    separateHero: $("separateHero").checked,
    minScore: Number($("minScore").value),
    minDecks: Number($("minDecks").value),
  };
}

function renderPlayerList() {
  const players = [...new Set(DECKS.map(d => d.player))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  $("playerList").innerHTML = players.map(player => `
    <label class="player-option">
      <input type="checkbox" value="${escapeHtml(player)}"
        ${selectedPlayers.has(player) ? "checked" : ""}>
      ${escapeHtml(player)}
    </label>
  `).join("");

  $("playerList").querySelectorAll("input").forEach(input => {
    input.addEventListener("change", () => {
      const wasEmpty = selectedPlayers.size === 0;

      if (input.checked) selectedPlayers.add(input.value);
      else selectedPlayers.delete(input.value);

      const isEmpty = selectedPlayers.size === 0;

      // Reset thresholds when entering or leaving player-filter mode
      if (wasEmpty && !isEmpty) {
        $("minDecks").value = 1;
        $("minScore").value = 1;
      } else if (!wasEmpty && isEmpty) {
        $("minDecks").value = 2;
        $("minScore").value = 5;
      }

      buildGraph();
    });
  });
}

/* ---------- Graph construction ---------- */
function aggregate(decks, separateEvo, separateHero) {
  const nodes = new Map();
  const edges = new Map();

  for (const deck of decks) {
    const isWin = deck.win === 1;
    const keyToVariant = new Map();
    for (const raw of deck.cards) keyToVariant.set(cardKey(raw, separateEvo, separateHero), parseCard(raw).variant);
    const cards = [...keyToVariant.keys()];

    for (const card of cards) {
      if (!nodes.has(card)) {
        nodes.set(card, { id: card, label: card, decks: 0, wins: 0, losses: 0, variants: new Set() });
      }
      const node = nodes.get(card);
      node.decks++;
      isWin ? node.wins++ : node.losses++;
      node.variants.add(keyToVariant.get(card));
    }

    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const [a, b] = cards[i] < cards[j] ? [cards[i], cards[j]] : [cards[j], cards[i]];
        const id = JSON.stringify([a, b]);
        if (!edges.has(id)) edges.set(id, { id, from: a, to: b, weight: 0, decks: 0, wins: 0, losses: 0 });
        const edge = edges.get(id);
        edge.weight += isWin ? WIN_WEIGHT : LOSS_WEIGHT;
        edge.decks++;
        isWin ? edge.wins++ : edge.losses++;
      }
    }
  }
  return { nodes, edges };
}

function buildGraph() {
  const { outcome, separateEvo, separateHero } = getFilters();
  const hasPlayerFilter = selectedPlayers.size > 0;
  const minScore = Number($("minScore").value);
  const minDecks = Number($("minDecks").value);
  const decks = DECKS.filter(d =>
    (outcome === "all" || (outcome === "wins" ? d.win === 1 : d.win === 0)) &&
    (selectedPlayers.size === 0 || selectedPlayers.has(d.player))
  );
  const { nodes, edges } = aggregate(decks, separateEvo, separateHero);

  // Apply edge filters, then node filters, then drop edges whose nodes were removed.
  const edgeCandidates = [...edges.values()].filter(e => e.decks >= minDecks);
  const activeIds = new Set(edgeCandidates.flatMap(e => [e.from, e.to]));
  const visibleNodes = [...nodes.values()].filter(n => activeIds.has(n.id));
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = edgeCandidates.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));

  // Weighted degree
  const degree = new Map();
  for (const e of visibleEdges) {
    degree.set(e.from, (degree.get(e.from) || 0) + e.weight);
    degree.set(e.to, (degree.get(e.to) || 0) + e.weight);
  }
  const filteredNodes = visibleNodes.filter(n => (degree.get(n.id) || 0) >= minScore);
  const filteredIds = new Set(filteredNodes.map(n => n.id));
  const finalEdges = visibleEdges.filter(e => filteredIds.has(e.from) && filteredIds.has(e.to));
  const maxDegree = Math.max(1, ...filteredNodes.map(n => degree.get(n.id) || 0));

  const nodeData = filteredNodes.map(n => {
    const isSelected = n.id === selectedNode;
    const variant = parseCard(n.id).variant;
    const color = COLORS[variant];
    const score = degree.get(n.id) || 0;
    return {
      id: n.id,
      label: n.label,
      shape: "image",
      image: getCardImage(n.id),
      brokenImage: "./assets/placeholder.png",
      value: 10 + (score / maxDegree) * 30,
      color: {
        background: isSelected ? "#ff4040" : color,
        border: color,
        highlight: { background: "#ff4040", border: color }
      },
      font: {
        color: "#ffffff",
        size: 16,
        face: "Inter, system-ui, sans-serif",
        strokeWidth: 3,
        strokeColor: "#0b1020"
      },
      title: (() => {
        const div = document.createElement("div");
        div.innerHTML = `<b>${escapeHtml(n.label)}</b><br>
          Deck appearances: ${n.decks}<br>
          Wins: ${n.wins}<br>
          Losses: ${n.losses}<br>
          Total Weight: ${score.toFixed(1)}`;
        return div;
      })(),
      _stats: { ...n, degree: score, variants: [...n.variants] }
    };
  });

  const edgeData = finalEdges.map(e => ({
    id: e.id,
    from: e.from,
    to: e.to,
    value: e.weight,
    width: 0.5 + Math.sqrt(e.weight) * 0.75,
    color: { color: "rgba(148, 167, 202, .34)", highlight: "#ffffff", hover: "#a9c5ff" },
    title: (() => {
        const tooltip = document.createElement("div");
        tooltip.innerHTML = `
            <b>${escapeHtml(e.from)} + ${escapeHtml(e.to)}</b><br>
            Shared decks: ${e.decks}<br>
            Wins: ${e.wins}<br>
            Losses: ${e.losses}<br>
            Weight: ${e.weight.toFixed(1)}<br>`;
        return tooltip;
    })(),
    _decks: e.decks,
    _wins: e.wins,
    _losses: e.losses
  }));

  nodesDS.clear(); edgesDS.clear();
  nodesDS.add(nodeData); edgesDS.add(edgeData);

  // Stats / labels
  $("deckCount").textContent = decks.length;
  $("nodeCount").textContent = filteredNodes.length;
  $("edgeCount").textContent = finalEdges.length;
  $("weightTotal").textContent = finalEdges.reduce((s, e) => s + e.weight, 0).toFixed(1);
  $("graphStatus").textContent = `${filteredNodes.length} cards · ${finalEdges.length} links`;
  $("minScoreValue").textContent = minScore.toFixed(1);
  $("minDecksValue").textContent = minDecks;

  if (selectedNode && !filteredIds.has(selectedNode)) {
    selectedNode = null;
    $("details").innerHTML = "<p>Selected card is hidden by the current filters.</p>";
  }
  network.fit({ animation: { duration: 350, easingFunction: "easeInOutQuad" }, minZoomLevel: 0.5, maxZoomLevel: 0.5 });
}



/* ---------- Sidebar ---------- */
function showNodeDetails(id) {
  const node = nodesDS.get(id);
  if (!node) return;
  selectedNode = id;

  const related = edgesDS.get()
    .filter(e => e.from === id || e.to === id)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const items = related.map(e => {
    const other = e.from === id ? e.to : e.from;
    return `<li><strong>${escapeHtml(other)}</strong> — ${e._decks} decks, ${e._wins} W, ${e._losses} L</li>`;
  }).join("");

  const s = node._stats;
  $("details").innerHTML = `
    <p><strong>${escapeHtml(node.label)}</strong></p>
    <p>Appears in <strong>${s.decks}</strong> decks<br>Wins: <strong>${s.wins}</strong> · Losses: <strong>${s.losses}</strong><br>Total Weight: <strong>${s.degree.toFixed(1)}</strong></p>
    <p><strong>Strongest links</strong></p>
    <ol>${items || "<li>No visible connections</li>"}</ol>`;
}

function resetView() {
  $("outcome").value = "all";
  $("separateEvo").checked = false;
  $("separateHero").checked = false;
  $("minScore").value = 0;
  $("minDecks").value = 1;
  $("search").value = "";
  selectedNode = null;
  $("details").innerHTML = "<p>Click a node to see its deck usage and strongest connections.</p>";
  buildGraph();
}

/* ---------- Events ---------- */
network.on("click", params => {
  if (params.nodes.length) showNodeDetails(params.nodes[0]);
});
["outcome", "separateEvo", "separateHero", "minScore", "minDecks"].forEach(id => $(id).addEventListener("input", buildGraph));
$("search").addEventListener("keydown", function(event) {
  if (event.key !== "Enter") return;

  const query = this.value.toLowerCase().trim();
  if (!query) return;

  const match = nodesDS.get().find(node =>
    node.label.toLowerCase().includes(query) ||
    String(node.id).toLowerCase().includes(query)
  );

  if (!match) { 
    alert("Card not found!");
    return;
  }

  network.unselectAll();
  network.focus(match.id, { scale: 1.5, animation: true });
  network.selectNodes([match.id]);
  showNodeDetails(match.id);
});
$("reset").addEventListener("click", resetView);

network.on("selectNode", function (params) {
    network.setSelection({
        nodes: params.nodes,
        edges: network.getConnectedEdges(params.nodes[0])
    });
});

network.on("deselectNode", function () {
    network.unselectAll();
});

function getCardImage(name) {
  const path = `./assets/${name.replace(/\s+/g, "")}.png`;
  const img = new Image();
  img.src = path;

  return path;
}

/* ---------- Boot ---------- */
async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DECKS = await res.json();
    renderPlayerList();
    buildGraph();
  } catch (err) {
    $("graphStatus").textContent = "Failed to load deck data — run server.py";
    console.error("Could not load deck data:", err);
  }
}
init();

