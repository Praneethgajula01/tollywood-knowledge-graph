import { useState, useEffect } from 'react';
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import { NodeSquareProgram } from '@sigma/node-square';
import { loadGraphData } from './data/parser';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';

import DobScale from './components/DobScale';

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
      
      // Wait for the camera to fit the graph, then lock zoom out
      setTimeout(() => {
        if (sigma && sigma.getCamera()) {
          const initialRatio = sigma.getCamera().getState().ratio;
          sigma.setSetting("zoomMax", initialRatio);
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
      if (!graph.hasNode(activeNodeId)) return;
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
          if (selectedNodeId) {
            res.hidden = true;
          } else {
            res.color = "rgba(200, 195, 185, 0.3)"; // Faded
            res.label = "";
            res.zIndex = 0;
          }
        }
        return res;
      });

      sigma.setSetting("edgeReducer", (edge, data) => {
        const res = { ...data };
        if (graph.hasExtremity(edge, activeNodeId)) {
          res.color = "rgba(92, 45, 18, 0.9)";
          res.size = 0.8;
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
  defaultNodeColor: "#e0d9cc",
  defaultEdgeColor: "#5c2d12",
  minEdgeSize: 0.1,
  maxEdgeSize: 1.5,
  labelSize: 14,
  labelFont: "Arial",
  labelWeight: "normal",
  defaultLabelColor: "#333333",
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

    context.fillStyle = "#7a280f";
    context.fillText(data.label, data.x + textOffsetX, data.y + textOffsetY + 1);
  }
};

function App() {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sigmaInstance, setSigmaInstance] = useState(null);
  
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
              Explore the constellation of Telugu cinema. Search for your favorite actors or movies.
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
          />
        </aside>
      </div>
    </>
  );
}

export default App;
