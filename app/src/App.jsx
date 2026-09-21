import { useState, useEffect } from 'react';
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import { NodeSquareProgram } from '@sigma/node-square';
import { loadGraphData } from './data/parser';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';

const GraphManager = ({ setHoveredNode, hoveredNodeId, selectedNodeId, setSelectedNode, setIsLoading, setSigmaInstance }) => {
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
    }).catch(error => {
      console.error("Failed to load graph data", error);
      setIsLoading(false);
    });
  }, [loadGraph, setIsLoading]);

  useEffect(() => {
    registerEvents({
      enterNode: (event) => setHoveredNode(event.node),
      leaveNode: () => setHoveredNode(null),
      clickNode: (event) => {
        setSelectedNode(event.node);
        // Temporarily comment out the animation to see if it's the culprit
        // const nodePosition = sigma.getGraph().getNodeAttributes(event.node);
        // const currentCameraState = sigma.getCamera().getState();
        // sigma.getCamera().animate(
        //   { x: nodePosition.x, y: nodePosition.y, ratio: currentCameraState.ratio },
        //   { duration: 600 }
        // );
      },
      clickStage: () => setSelectedNode(null),
    });
  }, [registerEvents, setHoveredNode, setSelectedNode, sigma]);

  useEffect(() => {
    const graph = sigma.getGraph();
    if (!graph) return;

    const activeNodeId = hoveredNodeId || selectedNodeId;

    if (activeNodeId) {
      const neighbors = new Set(graph.neighbors(activeNodeId));

      sigma.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };
        if (node === activeNodeId || neighbors.has(node)) {
          if (node === activeNodeId) {
            res.forceLabel = true;
            res.size = (data.size || 5) * 1.5;
            res.highlighted = true; // Only highlight the active node
          }
          res.zIndex = 1;
          res.highlighted = true;

          //res.labelColor = "#ffffff";
        } else {
          res.color = "rgba(100, 100, 100, 0.1)"; // Very faded
          res.label = "";
          res.zIndex = 0;
        }
        return res;
      });

      sigma.setSetting("edgeReducer", (edge, data) => {
        const res = { ...data };
        if (graph.hasExtremity(edge, activeNodeId)) {
          res.color = "rgba(255, 200, 120, 1)";
          res.size = 0.5; // Make edge thinner (tiny)
          res.zIndex = 1;
        } else {
          res.hidden = true;
        }
        return res;
      });
    } else {
      sigma.setSetting("nodeReducer", null);
      sigma.setSetting("edgeReducer", null);
    }
  }, [hoveredNodeId, selectedNodeId, sigma]);

  return null;
};

const sigmaSettings = {
  nodeProgramClasses: { square: NodeSquareProgram },
  defaultNodeType: "square",
  labelRenderedSizeThreshold: 2,
  defaultNodeColor: "#999",
  defaultEdgeColor: "#333",
  minEdgeSize: 0.01,
  maxEdgeSize: 1,
  labelSize: 14,
  labelFont: "Arial",
  labelWeight: "normal",
  defaultLabelColor: "#ffffff",
  hoverRenderer: (context, data, settings) => {
    // Draw node square
    const nodeSize = data.size || 5;
    context.fillStyle = data.color || settings.defaultNodeColor;
    context.fillRect(data.x - nodeSize, data.y - nodeSize, nodeSize * 2, nodeSize * 2);

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

    context.fillStyle = "#000000";
    context.fillText(data.label, data.x + textOffsetX, data.y + textOffsetY + 1);
  }
};

function App() {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sigmaInstance, setSigmaInstance] = useState(null);

  return (
    <>
      <header>
        <h1>Telugu Movies Graph</h1>
        <div className="meta">Most Complete Knowledge Graph of Telugu Movies</div>
      </header>
      <div className="shell">
        <aside className="list-panel" id="listPanel">
          <div className="panel">
            <SearchBar
              sigmaInstance={sigmaInstance}
              setSelectedNodeId={setSelectedNodeId}
              setHoveredNodeId={setHoveredNodeId}
            />
            <p style={{ marginTop: '16px' }}>
              Explore the constellation of Telugu cinema. Search for your favorite actors or movies.
            </p>
          </div>
        </aside>

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
            />
          </SigmaContainer>
        </main>

        <aside className="detail" id="detailPanel">
          <Sidebar selectedNodeId={selectedNodeId} sigmaInstance={sigmaInstance} />
        </aside>
      </div>
    </>
  );
}

export default App;
