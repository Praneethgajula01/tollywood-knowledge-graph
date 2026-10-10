import { useEffect, useState } from 'react';

const Sidebar = ({ selectedNodeId, setSelectedNodeId, setHoveredNodeId, sigmaInstance }) => {
  const [nodeData, setNodeData] = useState(null);
  const [cast, setCast] = useState([]);
  const [topActor, setTopActor] = useState(null); // Actor with most movies
  const [topActress, setTopActress] = useState(null); // Actress with most movies

  const handleSelectNode = (nodeId) => {
    if (!nodeId || !setSelectedNodeId) return;

    if (sigmaInstance) {
      const graph = sigmaInstance.getGraph();
      if (graph && graph.hasNode(nodeId)) {
        setSelectedNodeId(nodeId);
        const nodeDisplayData = sigmaInstance.getNodeDisplayData(nodeId);
        const camera = sigmaInstance.getCamera();
        if (camera && nodeDisplayData) {
          camera.animate(
            { x: nodeDisplayData.x, y: nodeDisplayData.y, ratio: camera.getState().ratio },
            { duration: 500 }
          );
        }
      }
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  const getMovieNodeId = (movie) => {
    if (!sigmaInstance) return null;
    const graph = sigmaInstance.getGraph();
    if (!graph) return null;

    const id1 = `movie_${movie.movie_id}`;
    if (graph.hasNode(id1)) return id1;
    const id2 = `movie_${movie.id}`;
    if (graph.hasNode(id2)) return id2;
    return null;
  };

  useEffect(() => {
    if (selectedNodeId && sigmaInstance) {
      const graph = sigmaInstance.getGraph();
      if (graph.hasNode(selectedNodeId)) {
        const attrs = graph.getNodeAttributes(selectedNodeId);
        setNodeData(attrs);
        
        if (attrs.nodeType === 'movie') {
          const neighbors = graph.neighbors(selectedNodeId);
          const actors = neighbors
            .map(n => {
              const actorAttrs = graph.getNodeAttributes(n);
              // Try to find the character name from the actor's movie list
              const movieData = actorAttrs.data?.movies?.find(m => `movie_${m.movie_id}` === selectedNodeId || `movie_${m.id}` === selectedNodeId);
              return {
                nodeId: n,
                ...actorAttrs,
                character: movieData ? movieData.character : ''
              };
            })
            .filter(a => a.nodeType === 'actor');
          setCast(actors);
        } else {
          setCast([]);
        }
      } else {
        setNodeData(null);
        setCast([]);
      }
    } else {
      setNodeData(null);
      setCast([]);
    }
  }, [selectedNodeId, sigmaInstance]);

  // Compute top actor and actress when graph is available
  useEffect(() => {
    if (sigmaInstance) {
      const graph = sigmaInstance.getGraph();
      const actorMap = { male: null, female: null };
      graph.forEachNode((nodeKey, attrs) => {
        if (attrs.nodeType === 'actor') {
          const movieCount = attrs.data?.movies?.length || 0;
          const gender = attrs.data?.gender || 'unknown';
          if (gender === 'male') {
            if (!actorMap.male || movieCount > actorMap.male.count) {
              actorMap.male = { label: attrs.label, count: movieCount };
            }
          } else if (gender === 'female') {
            if (!actorMap.female || movieCount > actorMap.female.count) {
              actorMap.female = { label: attrs.label, count: movieCount };
            }
          }
        }
      });
      setTopActor(actorMap.male);
      setTopActress(actorMap.female);
    }
  }, [sigmaInstance]);

  if (!nodeData) {
    return <div className="panel" style={{ alignItems: 'center', justifyContent: 'center', height: '100%', color: 'white' }}>Select a node to view details</div>;
  }

  const { nodeType: type, data, label } = nodeData;

  return (
    <div className="panel">
      <div className="sidebar-header">
        <div className={`badge badge-${type}`}>
          {type}
        </div>
        <h2>{label}</h2>
      </div>

      <div className="sidebar-content">
        {type === 'movie' && data.poster_url && (
          <img src={data.poster_url} alt={label} className="sidebar-image" />
        )}
        {type === 'actor' && data.profile_url && (
          <div className="image-container">
            <img src={data.profile_url} alt={label} className="sidebar-image actor" />
          </div>
        )}
        
        {type === 'movie' && (
          <div className="meta-list">
            <div className="meta-item">
              <span className="meta-label">Year</span>
              <span className="meta-value">{data.year || 'Unknown'}</span>
            </div>
            {data.genres && (
              <div className="meta-item">
                <span className="meta-label">Genres</span>
                <span className="meta-value">{data.genres.join(', ')}</span>
              </div>
            )}
            {data.vote_average > 0 && (
              <div className="meta-item">
                <span className="meta-label">Rating</span>
                <span className="meta-value rating">⭐ {Number(data.vote_average).toFixed(1)}</span>
              </div>
            )}
            {data.overview && (
              <div className="overview-container">
                <span className="meta-label block">Overview</span>
                <p className="overview-text">{data.overview}</p>
              </div>
            )}
            
            {cast.length > 0 && (
              <div className="movie-cast-list">
                <span className="meta-label block" style={{ marginTop: '16px', marginBottom: '12px' }}>Cast</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                  {cast.map((actor, idx) => (
                    <div 
                      key={actor.nodeId || actor.data?.id || idx} 
                      className="result clickable" 
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectNode(actor.nodeId)}
                      onMouseEnter={() => setHoveredNodeId && setHoveredNodeId(actor.nodeId)}
                      onMouseLeave={() => setHoveredNodeId && setHoveredNodeId(null)}
                      title="Click to view actor on graph"
                    >
                      <span className="title">{actor.label}</span>
                      <span className="sub">{actor.character || 'Actor'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {type === 'actor' && (
          <div className="meta-list">
            <div className="meta-item">
              <span className="meta-label">Era / Year</span>
              <span className="meta-value">{data.dobLabel || (data.dobYear ? `c. ${data.dobYear}` : 'Unknown')}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Known For</span>
              <span className="meta-value">{data.movies ? data.movies.length : 0} Movies</span>
            </div>
            {data.movies && data.movies.length > 0 && (
              <div className="actor-movies-list">
                <span className="meta-label block" style={{ marginTop: '16px', marginBottom: '12px' }}>Filmography</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                  {[...data.movies]
                    .sort((a, b) => (b.year || 0) - (a.year || 0))
                    .map((movie, idx) => {
                      const movieNodeId = getMovieNodeId(movie);
                      const isAvailable = Boolean(movieNodeId);
                      return (
                        <div 
                          key={movie.movie_id || movie.id || idx} 
                          className={`result ${isAvailable ? 'clickable' : ''}`}
                          style={{ cursor: isAvailable ? 'pointer' : 'default', opacity: isAvailable ? 1 : 0.6 }}
                          onClick={() => isAvailable && handleSelectNode(movieNodeId)}
                          onMouseEnter={() => isAvailable && setHoveredNodeId && setHoveredNodeId(movieNodeId)}
                          onMouseLeave={() => isAvailable && setHoveredNodeId && setHoveredNodeId(null)}
                          title={isAvailable ? "Click to view movie on graph" : "Movie not on graph"}
                        >
                          <span className="title">{movie.title}</span>
                          <span className="sub">{movie.year || 'Unknown Year'} {movie.character ? ` • ${movie.character}` : ''}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
