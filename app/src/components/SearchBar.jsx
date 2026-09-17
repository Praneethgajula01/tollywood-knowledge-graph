import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

const SearchBar = ({ sigmaInstance, setSelectedNodeId, setHoveredNodeId }) => {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  
  const results = useMemo(() => {
    if (!query || query.length < 2 || !sigmaInstance) return [];
    
    const graph = sigmaInstance.getGraph();
    const matches = [];
    
    graph.forEachNode((node, attrs) => {
      if (matches.length < 50 && attrs.label && attrs.label.toLowerCase().includes(query.toLowerCase())) {
        if (filterType === 'all' || attrs.nodeType === filterType) {
          matches.push({ id: node, ...attrs });
        }
      }
    });
    
    return matches;
  }, [query, sigmaInstance, filterType]);

  const handleSelect = (node) => {
    setSelectedNodeId(node.id);
    // const nodePosition = sigmaInstance.getGraph().getNodeAttributes(node.id);
    // const currentCameraState = sigmaInstance.getCamera().getState();
    // sigmaInstance.getCamera().animate(
    //   { x: nodePosition.x, y: nodePosition.y, ratio: currentCameraState.ratio }, 
    //   { duration: 600 }
    // );
    setQuery('');
  };

  return (
    <div className="search-container">
      <label htmlFor="search">Find Actor Or Movie</label>
      <div className="search-input-wrap">
        <Search size={16} />
        <input 
          id="search"
          type="text" 
          className="search-input" 
          placeholder="Mahesh Babu, Prabhas..." 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="filter-bar">
        <button 
          className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          All
        </button>
        <button 
          className={`filter-btn ${filterType === 'actor' ? 'active' : ''}`}
          onClick={() => setFilterType('actor')}
        >
          Actors
        </button>
        <button 
          className={`filter-btn ${filterType === 'movie' ? 'active' : ''}`}
          onClick={() => setFilterType('movie')}
        >
          Movies
        </button>
      </div>
      
      {results.length > 0 && (
        <div className="result-list" style={{ marginTop: '12px' }}>
          {results.map(node => (
            <div 
              key={node.id} 
              className="result" 
              onClick={() => handleSelect(node)}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            >
              <span className="title">{node.label}</span>
              <span className="sub">{node.nodeType === 'actor' ? 'Actor' : 'Movie'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
