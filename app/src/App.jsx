import { useState, useEffect } from 'react';
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import { NodeSquareProgram } from '@sigma/node-square';
import { NodeCircleProgram } from 'sigma/rendering';
import { NodeDiamondProgram } from './rendering/NodeDiamondProgram';
import { loadGraphData } from './data/parser';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';

import DobScale from './components/DobScale';

const GraphManager = ({ setHoveredNode, hoveredNodeId, selectedNodeId, setSelectedNode, setIsLoading, setSigmaInstance, castNetworkMode = true }) => {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    setSigmaInstance(sigma);
  }, [sigma, setSigmaInstance]);

  useEffect(() => {
    loadGraphData().then(graph => {
      loadGraph(graph);
      setIsLoading(false);
      
      // Wait for the camera to fit the graph, then lock zoom out and record initial state
      setTimeout(() => {
        if (sigma && sigma.getCamera()) {
          const state = sigma.getCamera().getState();
          sigma.setSetting("zoomMax", state.ratio);
          sigma.setSetting("initialCameraState", { x: state.x, y: state.y, ratio: state.ratio });
        }
      }, 100);
    }).catch(error => {
      console.error("Failed to load graph data", error);
      setIsLoading(false);
    });
  }, [loadGraph, setIsLoading, sigma]);

  useEffect(() => {
    registerEvents({
      enterNode: (event) => setHoveredNode(event.node),
      leaveNode: () => setHoveredNode(null),
      clickNode: (event) => {
        setSelectedNode(event.node);
      },
      clickStage: () => {
        setSelectedNode(null);
        const initialCamera = sigma.getSetting("initialCameraState");
        if (initialCamera && sigma.getCamera()) {
          sigma.getCamera().animate(initialCamera, { duration: 500 });
        }
      },
    });
  }, [registerEvents, setHoveredNode, setSelectedNode, sigma]);

  useEffect(() => {
    const graph = sigma.getGraph();
    if (!graph) return;

    const activeNodeId = hoveredNodeId || selectedNodeId;

    if (!activeNodeId) {
      sigma.setSetting("nodeReducer", null);
      sigma.setSetting("edgeReducer", null);
      return;
    }

    if (!graph.hasNode(activeNodeId)) return;

    const selectedType = selectedNodeId && graph.hasNode(selectedNodeId) ? graph.getNodeAttribute(selectedNodeId, 'nodeType') : null;
    const hoveredType = hoveredNodeId && graph.hasNode(hoveredNodeId) ? graph.getNodeAttribute(hoveredNodeId, 'nodeType') : null;

    // --- CASE 1: COLLABORATION SPOTLIGHT (Hovering Actor while Director selected, or vice versa) ---
    const isDirectorActorCollab = (
      selectedNodeId &&
      hoveredNodeId &&
      selectedNodeId !== hoveredNodeId &&
      ((selectedType === 'director' && hoveredType === 'actor') ||
       (selectedType === 'actor' && hoveredType === 'director'))
    );

    if (isDirectorActorCollab) {
      const directorId = selectedType === 'director' ? selectedNodeId : hoveredNodeId;
      const actorId = selectedType === 'actor' ? selectedNodeId : hoveredNodeId;

      const directorMovies = new Set(graph.neighbors(directorId));
      const actorMovies = new Set(graph.neighbors(actorId));
      const sharedMovies = new Set([...directorMovies].filter(m => actorMovies.has(m)));

      sigma.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };
        if (node === directorId || node === actorId) {
          res.forceLabel = true;
          res.size = (data.size || 5) * 1.6;
          res.highlighted = true;
          res.zIndex = 3;
        } else if (sharedMovies.has(node)) {
          res.forceLabel = true;
          res.size = (data.size || 5) * 1.4;
          res.highlighted = true;
          res.zIndex = 2;
        } else if (directorMovies.has(node)) {
          // Dim non-collaborating movies of this director
          res.color = "rgba(180, 180, 180, 0.2)";
          res.label = "";
          res.zIndex = 0;
        } else {
          res.hidden = true;
        }
        return res;
      });

      sigma.setSetting("edgeReducer", (edge, data) => {
        const res = { ...data };
        const u = graph.source(edge);
        const v = graph.target(edge);

        const connectsDirToShared = (u === directorId && sharedMovies.has(v)) || (v === directorId && sharedMovies.has(u));
        const connectsActorToShared = (u === actorId && sharedMovies.has(v)) || (v === actorId && sharedMovies.has(u));

        if (connectsDirToShared) {
          res.color = "rgba(56, 189, 248, 1)"; // Glowing azure
          res.size = 2.0;
          res.zIndex = 3;
        } else if (connectsActorToShared) {
          res.color = "rgba(251, 146, 60, 1)"; // Glowing amber
          res.size = 2.0;
          res.zIndex = 3;
        } else {
          res.hidden = true;
        }
        return res;
      });
      return;
    }

    // --- CASE 2: FILM SPOTLIGHT (Hovering a movie while Director selected) ---
    const isDirectorMovieCollab = (
      selectedNodeId &&
      hoveredNodeId &&
      selectedNodeId !== hoveredNodeId &&
      ((selectedType === 'director' && hoveredType === 'movie') ||
       (selectedType === 'movie' && hoveredType === 'director'))
    );

    if (isDirectorMovieCollab) {
      const directorId = selectedType === 'director' ? selectedNodeId : hoveredNodeId;
      const movieId = selectedType === 'movie' ? selectedNodeId : hoveredNodeId;

      const movieActors = new Set(
        graph.neighbors(movieId).filter(n => graph.getNodeAttribute(n, 'nodeType') === 'actor')
      );
      const directorMovies = new Set(graph.neighbors(directorId));

      sigma.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };
        if (node === directorId || node === movieId) {
          res.forceLabel = true;
          res.size = (data.size || 5) * 1.7;
          res.highlighted = true;
          res.zIndex = 3;
        } else if (movieActors.has(node)) {
          res.forceLabel = true;
          res.highlighted = true;
          res.zIndex = 2;
        } else if (directorMovies.has(node)) {
          res.color = "rgba(180, 180, 180, 0.2)";
          res.label = "";
          res.zIndex = 0;
        } else {
          res.hidden = true;
        }
        return res;
      });

      sigma.setSetting("edgeReducer", (edge, data) => {
        const res = { ...data };
        const u = graph.source(edge);
        const v = graph.target(edge);

        const isDirEdge = (u === directorId && v === movieId) || (v === directorId && u === movieId);
        const isActorEdge = (u === movieId && movieActors.has(v)) || (v === movieId && movieActors.has(u));

        if (isDirEdge) {
          res.color = "rgba(56, 189, 248, 1)";
          res.size = 2.2;
          res.zIndex = 3;
        } else if (isActorEdge) {
          res.color = "rgba(251, 146, 60, 0.9)";
          res.size = 1.3;
          res.zIndex = 2;
        } else {
          res.hidden = true;
        }
        return res;
      });
      return;
    }

    // --- CASE 3: DIRECTOR SELECTION (With optional 2-hop Cast Network) ---
    const activeType = graph.getNodeAttribute(activeNodeId, 'nodeType');

    if (activeType === 'director') {
      const directMovies = new Set(graph.neighbors(activeNodeId));
      const connectedActors = new Set();

      if (castNetworkMode) {
        directMovies.forEach(m => {
          graph.neighbors(m).forEach(n => {
            if (graph.getNodeAttribute(n, 'nodeType') === 'actor') {
              connectedActors.add(n);
            }
          });
        });
      }

      sigma.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };
        if (node === activeNodeId) {
          res.forceLabel = true;
          res.size = (data.size || 5) * 1.6;
          res.highlighted = true;
          res.zIndex = 3;
        } else if (directMovies.has(node)) {
          res.forceLabel = true;
          res.highlighted = true;
          res.zIndex = 2;
        } else if (castNetworkMode && connectedActors.has(node)) {
          res.zIndex = 1;
        } else {
          if (selectedNodeId) {
            res.hidden = true;
          } else {
            res.color = "rgba(200, 195, 185, 0.3)";
            res.label = "";
            res.zIndex = 0;
          }
        }
        return res;
      });

      sigma.setSetting("edgeReducer", (edge, data) => {
        const res = { ...data };
        if (graph.hasExtremity(edge, activeNodeId)) {
          res.color = "rgba(2, 132, 199, 0.95)";
          res.size = 1.1;
          res.zIndex = 2;
        } else if (castNetworkMode) {
          const u = graph.source(edge);
          const v = graph.target(edge);
          const hasMovie = directMovies.has(u) || directMovies.has(v);
          const hasActor = connectedActors.has(u) || connectedActors.has(v);

          if (hasMovie && hasActor) {
            res.color = "rgba(180, 83, 9, 0.35)";
            res.size = 0.3;
            res.zIndex = 0;
          } else {
            res.hidden = true;
          }
        } else {
          res.hidden = true;
        }
        return res;
      });
      return;
    }

    // --- CASE 4: DEFAULT (Movie or Actor 1-hop view) ---
    const neighbors = new Set(graph.neighbors(activeNodeId));

    sigma.setSetting("nodeReducer", (node, data) => {
      const res = { ...data };
      if (node === activeNodeId || neighbors.has(node)) {
        if (node === activeNodeId) {
          res.forceLabel = true;
          res.size = (data.size || 5) * 1.5;
          res.highlighted = true;
        }
        res.zIndex = 1;
        res.highlighted = true;
      } else {
        if (selectedNodeId) {
          res.hidden = true;
        } else {
          res.color = "rgba(200, 195, 185, 0.3)";
          res.label = "";
          res.zIndex = 0;
        }
      }
      return res;
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      const res = { ...data };
      if (graph.hasExtremity(edge, activeNodeId)) {
        const type = graph.getNodeAttribute(activeNodeId, 'nodeType');
        res.color = type === 'director' ? "rgba(2, 132, 199, 0.95)" : "rgba(92, 45, 18, 0.9)";
        res.size = 1.0;
        res.zIndex = 1;
      } else {
        res.hidden = true;
      }
      return res;
    });
  }, [hoveredNodeId, selectedNodeId, sigma, castNetworkMode]);

  return null;
};

const sigmaSettings = {
  nodeProgramClasses: {
    square: NodeSquareProgram,
    circle: NodeCircleProgram,
    diamond: NodeDiamondProgram,
  },
  defaultNodeType: "square",
  labelRenderedSizeThreshold: 2,
  defaultNodeColor: "#e0d9cc",
  defaultEdgeColor: "#5c2d12",
  minEdgeSize: 0.1,
  maxEdgeSize: 1.5,
  labelSize: 14,
  labelFont: "Arial",
  labelWeight: "normal",
  defaultLabelColor: "#333333",
  hoverRenderer: (context, data, settings) => {
    // Draw node shape
    const nodeSize = data.size || 5;
    context.fillStyle = data.color || settings.defaultNodeColor;

    if (data.type === 'diamond' || data.nodeType === 'director') {
      context.beginPath();
      context.moveTo(data.x, data.y - nodeSize * 1.35);
      context.lineTo(data.x + nodeSize * 1.35, data.y);
      context.lineTo(data.x, data.y + nodeSize * 1.35);
      context.lineTo(data.x - nodeSize * 1.35, data.y);
      context.closePath();
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = "#38bdf8";
      context.stroke();
    } else if (data.type === 'circle' || data.nodeType === 'actor') {
      context.beginPath();
      context.arc(data.x, data.y, nodeSize, 0, Math.PI * 2);
      context.closePath();
      context.fill();
    } else {
      context.fillRect(data.x - nodeSize, data.y - nodeSize, nodeSize * 2, nodeSize * 2);
    }

    // Draw label with background
    if (!data.label) return;
    const size = settings.labelSize || 14;
    const font = settings.labelFont || "Arial";
    const weight = settings.labelWeight || "normal";
    context.font = `${weight} ${size}px ${font}`;
    const width = context.measureText(data.label).width;

    const textOffsetX = nodeSize + 4;
    const textOffsetY = size / 3;
    const paddingX = 6;
    const paddingY = 4;

    context.fillStyle = "#ffffff";
    context.fillRect(
      data.x + textOffsetX - paddingX,
      data.y + textOffsetY - size - paddingY + 3,
      width + (paddingX * 2),
      size + (paddingY * 2)
    );

    context.fillStyle = data.nodeType === 'director' ? "#0369a1" : "#7a280f";
    context.fillText(data.label, data.x + textOffsetX, data.y + textOffsetY + 1);
  }
};

function App() {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sigmaInstance, setSigmaInstance] = useState(null);
  const [castNetworkMode, setCastNetworkMode] = useState(true);
  
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <>
      <header>
        <h1>Telugu Movies Graph</h1>
        <div className="meta">తెలుగు సినిమా… ఒకే గ్రాఫ్లో</div>
      </header>
      <div className="shell">
        <aside className={`list-panel ${leftOpen ? '' : 'closed'}`} id="listPanel">
          <div className="panel">
            <SearchBar
              sigmaInstance={sigmaInstance}
              setSelectedNodeId={setSelectedNodeId}
              setHoveredNodeId={setHoveredNodeId}
            />
            <p style={{ marginTop: '16px' }}>
              Explore the constellation of Telugu cinema. Search for your favorite actors, directors, or movies.
            </p>
          </div>
        </aside>

        <div className="toggle-line" onClick={() => setLeftOpen(!leftOpen)} title="Toggle Left Panel"></div>

        <main className="stage" id="graphStage">
          {isLoading && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <p>Laying out Knowledge Graph...</p>
            </div>
          )}
          <SigmaContainer
            style={{ width: "100%", height: "100%", position: "absolute" }}
            settings={sigmaSettings}
          >
            <GraphManager
              setHoveredNode={setHoveredNodeId}
              hoveredNodeId={hoveredNodeId}
              selectedNodeId={selectedNodeId}
              setSelectedNode={setSelectedNodeId}
              setIsLoading={setIsLoading}
              setSigmaInstance={setSigmaInstance}
              castNetworkMode={castNetworkMode}
            />
            <DobScale />
          </SigmaContainer>
        </main>

        <div className="toggle-line" onClick={() => setRightOpen(!rightOpen)} title="Toggle Right Panel"></div>

        <aside className={`detail ${rightOpen ? '' : 'closed'}`} id="detailPanel">
          <Sidebar
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            setHoveredNodeId={setHoveredNodeId}
            sigmaInstance={sigmaInstance}
            castNetworkMode={castNetworkMode}
            setCastNetworkMode={setCastNetworkMode}
          />
        </aside>
      </div>
    </>
  );
}

export default App;
