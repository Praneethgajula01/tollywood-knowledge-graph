import Graph from 'graphology';

const TMDB_BASE_URL = 'https://image.tmdb.org/t/p/w200';

export async function loadGraphData() {
  const [moviesRes, actorsRes] = await Promise.all([
    fetch('/data/movies.json'),
    fetch('/data/actors.json')
  ]);

  const movies = await moviesRes.json();
  const actors = await actorsRes.json();

  const graph = new Graph();

  // Sort movies by popularity to order them vertically
  movies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  // --- KERALAM STYLE SEMANTIC CLUSTERING (HORIZONTAL BANDS) ---
  // 1. Identify top actors (hubs) to form the base lanes
  const actorMovieCounts = new Map();
  actors.forEach(a => {
    actorMovieCounts.set(a.id, (a.movies || []).length);
  });
  const topActors = [...actors].sort((a, b) => (actorMovieCounts.get(b.id) || 0) - (actorMovieCounts.get(a.id) || 0));
  const NUM_LANES = 12;
  const hubs = topActors.slice(0, NUM_LANES);
  const hubLanes = new Map(hubs.map((h, i) => [h.id, i]));

  // 2. Assign movies to lanes based on which hubs they feature
  const movieYPos = new Map();
  movies.forEach(m => {
    // Find if this movie has any hub actors
    let sumLane = 0;
    let countLane = 0;

    // We need to look up which actors are in this movie.
    // The data is currently actor -> movies, so we must reverse it
    actors.forEach(a => {
      if (a.movies && a.movies.some(am => am.movie_id === m.id)) {
        if (hubLanes.has(a.id)) {
          sumLane += hubLanes.get(a.id);
          countLane++;
        }
      }
    });

    let finalLane;
    if (countLane > 0) {
      finalLane = sumLane / countLane;
    } else {
      // Fallback: robust hash based on ID to prevent NaN
      let idNum = parseInt(m.id, 10);
      if (isNaN(idNum)) {
        idNum = String(m.id).charCodeAt(0) || 0;
      }
      finalLane = (idNum % NUM_LANES) || 0;
    }

    // Spread lanes vertically to use top empty space
    const yBase = (finalLane - (NUM_LANES / 2)) * 2000 - 15000;
    movieYPos.set(m.id, yBase);
  });

  const movieMap = new Map();
  movies.forEach(m => movieMap.set(m.id, m));

  const genreColors = {
    'Action': '#8c1c13', 'Comedy': '#bf4342', 'Romance': '#e7d7c1',
    'Drama': '#1d4e89', 'Thriller': '#735751', 'Horror': '#ff9505', 'Family': '#ffb627',
  };

  // --- ADD MOVIE NODES ---
  movies.forEach((movie) => {
    const year = movie.year || 2000;
    const popularity = movie.popularity || 0;
    const baseSize = 1.5;
    const nodeSize = baseSize + (Math.sqrt(popularity) / 3);

    const movieColor = movie.genres && movie.genres[0] ? (genreColors[movie.genres[0]] || '#fca5a5') : '#fbd38d';

    // X is strict timeline
    const xBase = (year - 1930) * 1200 + (Math.random() - 0.5) * 400;
    // Y is horizontal lane
    const yBase = movieYPos.get(movie.id) + (Math.random() - 0.5) * 1500;

    graph.addNode(`movie_${movie.id}`, {
      label: movie.title,
      size: Math.min(Math.max(nodeSize, 1.5), 10),
      color: movieColor,
      nodeType: 'movie',
      data: {
        ...movie,
        poster_url: movie.poster_path ? `${TMDB_BASE_URL}${movie.poster_path}` : null
      },
      x: xBase,
      y: yBase
    });
  });

  // --- ADD ACTOR NODES ---
  actors.forEach((actor) => {
    if (!actor.movies || actor.movies.length === 0) return;

    const numMovies = actor.movies.length;
    const baseSize = 1.0;
    const nodeSize = baseSize + (Math.sqrt(numMovies) * 0.6);

    let sumYear = 0;
    let sumY = 0;

    let maxCount = 0;
    let topGenre = null;
    const genreCounts = {};

    actor.movies.forEach(m => {
      sumYear += (m.year || 2000);
      sumY += movieYPos.get(m.movie_id) || 0;

      const fullMovie = movieMap.get(m.movie_id);
      if (fullMovie && fullMovie.genres && fullMovie.genres.length > 0) {
        const genre = fullMovie.genres[0];
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        if (genreCounts[genre] > maxCount) {
          maxCount = genreCounts[genre];
          topGenre = genre;
        }
      }
    });

    const avgYear = sumYear / numMovies;
    const avgY = sumY / numMovies;

    const actorColor = topGenre ? (genreColors[topGenre] || '#c4a6fb') : '#c4a6fb';

    const xBase = (avgYear - 1930) * 1200 + (Math.random() - 0.5) * 4000;
    const yBase = avgY + (Math.random() - 0.5) * 8000;

    // Keralam separation offset (modified to place actors directly downside)
    const ACTOR_OFFSET_X = 0;
    const ACTOR_OFFSET_Y = 40000; // Push actors down to the bottom empty space

    graph.addNode(`actor_${actor.id}`, {
      label: actor.name,
      size: Math.min(nodeSize, 8),
      color: actorColor,
      nodeType: 'actor',
      data: {
        ...actor,
        profile_url: actor.profile_path ? `${TMDB_BASE_URL}${actor.profile_path}` : null
      },
      x: xBase + ACTOR_OFFSET_X,
      y: yBase + ACTOR_OFFSET_Y
    });

    // Edges
    const edgeOpacity = Math.min(0.2, 0.02 + (numMovies * 0.005));
    const edgeColor = `rgba(66, 185, 199, ${edgeOpacity})`;

    actor.movies.forEach(m => {
      const movieId = `movie_${m.movie_id}`;
      if (graph.hasNode(movieId) && !graph.hasEdge(`actor_${actor.id}`, movieId)) {
        graph.addEdge(`actor_${actor.id}`, movieId, {
          size: 0.0001,
          color: edgeColor
        });
      }
    });
  });

  // Remove isolated movie nodes (no actors connected)
  graph.forEachNode((node, attrs) => {
    if (attrs.nodeType === 'movie' && graph.degree(node) === 0) {
      graph.dropNode(node);
    }
  });

  // --- STRICT ANTI-OVERLAP (RELAX) ALGORITHM ---
  // Pushes overlapping nodes apart so every node sits in its own clear space
  const iterations = 5; // Reduced iterations to prevent freezing
  const cellSize = 1200; // Must be larger than the max minDist

  for (let it = 0; it < iterations; it++) {
    const grid = new Map();
    const nodesList = graph.nodes();

    // Bin nodes into spatial grid
    for (const nodeId of nodesList) {
      const p = graph.getNodeAttributes(nodeId);
      const gx = Math.floor(p.x / cellSize);
      const gy = Math.floor(p.y / cellSize);
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(nodeId);
    }

    // Resolve collisions
    for (const nodeId of nodesList) {
      const p = graph.getNodeAttributes(nodeId);
      const gx = Math.floor(p.x / cellSize);
      const gy = Math.floor(p.y / cellSize);

      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          const bucket = grid.get(`${gx + ix},${gy + iy}`);
          if (!bucket) continue;

          for (const mId of bucket) {
            if (mId <= nodeId) continue;

            const q = graph.getNodeAttributes(mId);
            let dx = q.x - p.x;
            let dy = q.y - p.y;
            let d = Math.hypot(dx, dy) || 0.01;

            // Massively increased the multiplier to ensure a large physical gap
            const minDist = (p.size + q.size) * 80 + 200;

            if (d < minDist) {
              const push = (minDist - d) * 0.5; // Stronger push
              dx /= d;
              dy /= d;
              p.x -= dx * push;
              p.y -= dy * push;
              q.x += dx * push;
              q.y += dy * push;
            }
          }
        }
      }
    }
  }

  // Final pass: apply a slight tilt (rotation) and save coordinates
  // Negative angle tilts the left side downwards and right side upwards
  const angle = 0 * (Math.PI / 180);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  graph.forEachNode((nodeId, attr) => {
    const rotatedX = attr.x * cosA - attr.y * sinA;
    const rotatedY = attr.x * sinA + attr.y * cosA;

    graph.setNodeAttribute(nodeId, 'x', rotatedX);
    graph.setNodeAttribute(nodeId, 'y', rotatedY);
  });

  return graph;
}
