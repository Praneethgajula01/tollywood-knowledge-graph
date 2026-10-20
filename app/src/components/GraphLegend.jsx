import { useState, useMemo } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';

const GraphLegend = ({ sigmaInstance }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Compute live node counts
  const counts = useMemo(() => {
    if (!sigmaInstance) return { actors: 0, movies: 0, directors: 0 };
    const graph = sigmaInstance.getGraph();
    let actors = 0, movies = 0, directors = 0;
    graph.forEachNode((_, attrs) => {
      if (attrs.nodeType === 'actor') actors++;
      else if (attrs.nodeType === 'movie') movies++;
      else if (attrs.nodeType === 'director') directors++;
    });
    return { actors, movies, directors };
  }, [sigmaInstance]);

  const panToColumn = (xTarget) => {
    if (!sigmaInstance) return;
    const camera = sigmaInstance.getCamera();
    camera.animate(
      { x: xTarget, y: camera.getState().y, ratio: camera.getState().ratio },
      { duration: 600 }
    );
  };

  return (
    <div className={`graph-legend-overlay ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="legend-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="legend-title">
          <Layers size={14} />
          <span>Graph Legend</span>
        </div>
        <button className="legend-toggle-btn" aria-label="Toggle legend">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {isExpanded && (
        <div className="legend-body">
          <div 
            className="legend-item clickable" 
            onClick={() => panToColumn(-60000)}
            title="Pan to Actors column (Left)"
          >
            <span className="legend-symbol symbol-actor">●</span>
            <div className="legend-info">
              <span className="legend-name">Actors</span>
              <span className="legend-meta">Left • DOB {counts.actors ? `(${counts.actors.toLocaleString()})` : ''}</span>
            </div>
          </div>

          <div 
            className="legend-item clickable" 
            onClick={() => panToColumn(0)}
            title="Pan to Movies column (Center)"
          >
            <span className="legend-symbol symbol-movie">■</span>
            <div className="legend-info">
              <span className="legend-name">Movies</span>
              <span className="legend-meta">Center • Year {counts.movies ? `(${counts.movies.toLocaleString()})` : ''}</span>
            </div>
          </div>

          <div 
            className="legend-item clickable" 
            onClick={() => panToColumn(60000)}
            title="Pan to Directors column (Right)"
          >
            <span className="legend-symbol symbol-director">◆</span>
            <div className="legend-info">
              <span className="legend-name">Directors</span>
              <span className="legend-meta">Right • Debut {counts.directors ? `(${counts.directors.toLocaleString()})` : ''}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphLegend;
