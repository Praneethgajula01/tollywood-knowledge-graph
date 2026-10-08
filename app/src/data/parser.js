import Graph from 'graphology';

const TMDB_BASE_URL = 'https://image.tmdb.org/t/p/w200';

// Comprehensive dictionary of known birth years for prominent Telugu actors
const KNOWN_DOBS = {
  // Pioneers & Early Era (1900-1940)
  "Chittor V. Nagaiah": 1904,
  "Relangi": 1910,
  "Ramana Reddy": 1921,
  "S. V. Ranga Rao": 1918,
  "N. T. Rama Rao": 1923,
  "N.T. Rama Rao": 1923,
  "NTR": 1923,
  "Akkineni Nageswara Rao": 1924,
  "ANR": 1924,
  "Suryakantham": 1924,
  "Bhanumathi Ramakrishna": 1925,
  "Gummadi": 1927,
  "Jaggayya": 1928,
  "Kanta Rao": 1923,
  "Kaikala Satyanarayana": 1935,
  "Savitri": 1936,
  "Jamuna": 1936,
  "Sobhan Babu": 1937,
  "Krishnam Raju": 1940,
  "Kota Srinivasa Rao": 1942,
  "Krishna": 1943,
  "Chalapathi Rao": 1944,
  "Chandra Mohan": 1945,
  "Giri Babu": 1943,
  "Annapoorna": 1948,

  // Veteran Era (1950-1969)
  "M. S. Narayana": 1951,
  "Mohan Babu": 1952,
  "Tanikella Bharani": 1954,
  "Chiranjeevi": 1955,
  "Brahmanandam": 1956,
  "Rajendra Prasad": 1956,
  "Posani Krishna Murali": 1958,
  "Jayasudha": 1958,
  "Akkineni Nagarjuna": 1959,
  "Nandamuri Balakrishna": 1960,
  "Daggubati Venkatesh": 1960,
  "Jaya Prada": 1962,
  "Jagapathi Babu": 1962,
  "Sridevi": 1963,
  "Raghu Babu": 1964,
  "Prakash Raj": 1965,
  "Brahmaji": 1965,
  "Vijayashanti": 1966,
  "Ravi Teja": 1968,
  "Srikanth": 1968,
  "Ali": 1968,

  // Modern Superstars & Stars (1970-1985)
  "Pawan Kalyan": 1971,
  "Soundarya": 1972,
  "Sunil Varma": 1974,
  "Mahesh Babu": 1975,
  "Gopichand": 1979,
  "Prabhas": 1979,
  "Vennela Kishore": 1980,
  "Anushka Shetty": 1981,
  "Allu Arjun": 1982,
  "Jr. N.T.R.": 1983,
  "N. T. Rama Rao Jr.": 1983,
  "Jr. NTR": 1983,
  "Nithiin": 1983,
  "Trisha Krishnan": 1983,
  "Nani": 1984,
  "Rana Daggubati": 1984,
  "Sharwanand": 1984,
  "Ram Charan": 1985,
  "Kajal Aggarwal": 1985,
  "Naga Chaitanya": 1986,
  "Sai Dharam Tej": 1986,
  "Samantha": 1987,

  // Contemporary Era (1988+)
  "Ram Pothineni": 1988,
  "Tamannaah Bhatia": 1989,
  "Vijay Deverakonda": 1989,
  "Varun Tej": 1990,
  "Pooja Hegde": 1990,
  "Keerthy Suresh": 1992,
  "Sai Pallavi": 1992,
  "Nivetha Thomas": 1995,
  "Rashmika Mandanna": 1996,
  "Sreeleela": 2001,
  "Krithi Shetty": 2003
};

export async function loadGraphData() {
  const [moviesRes, actorsRes] = await Promise.all([
    fetch('/data/movies.json'),
    fetch('/data/actors.json')
  ]);

  const movies = await moviesRes.json();
  const actors = await actorsRes.json();

  const graph = new Graph();

  // Sort movies by popularity
  movies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  const movieMap = new Map();
  movies.forEach(m => movieMap.set(m.id, m));

  const genreColors = {
    'Action': '#8c1c13', 'Comedy': '#bf4342', 'Romance': '#e7d7c1',
    'Drama': '#1d4e89', 'Thriller': '#735751', 'Horror': '#ff9505', 'Family': '#ffb627',
  };

  // --- ADD MOVIE NODES ---
  // Movies placed on the right column (+60,000 X), ordered vertically by release year
  movies.forEach((movie) => {
    const year = movie.year || 2000;
    const popularity = movie.popularity || 0;
    const baseSize = 1.5;
    const nodeSize = baseSize + (Math.sqrt(popularity) / 3);

    const movieColor = movie.genres && movie.genres[0] ? (genreColors[movie.genres[0]] || '#fca5a5') : '#fbd38d';

    // Top = Early Release Year (1930s), Bottom = Recent Release Year (2020s)
    const movieY = (2030 - year) * 1800 + (Math.random() - 0.5) * 1200;
    const movieX = 60000 + (Math.random() - 0.5) * 35000;

    graph.addNode(`movie_${movie.id}`, {
      label: movie.title,
      size: Math.min(Math.max(nodeSize, 1.5), 10),
      color: movieColor,
      nodeType: 'movie',
      data: {
        ...movie,
        poster_url: movie.poster_path ? `${TMDB_BASE_URL}${movie.poster_path}` : null
      },
      x: movieX,
      y: movieY
    });
  });

  // --- ADD ACTOR NODES ---
  // Actors placed on the left column (-60,000 X), ordered strictly by DOB (Date of Birth)
  actors.forEach((actor) => {
    if (!actor.movies || actor.movies.length === 0) return;

    const numMovies = actor.movies.length;
    const baseSize = 1.0;
    const nodeSize = baseSize + (Math.sqrt(numMovies) * 0.6);

    let maxCount = 0;
    let topGenre = null;
    const genreCounts = {};

    actor.movies.forEach(m => {
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

    const actorColor = topGenre ? (genreColors[topGenre] || '#c4a6fb') : '#c4a6fb';

    // Calculate DOB (Date of Birth / Birth Year)
    const knownDob = KNOWN_DOBS[actor.name] || (actor.name ? KNOWN_DOBS[actor.name.trim()] : null);
    let actorDob;
    let isExactDob = false;

    if (knownDob) {
      actorDob = knownDob;
      isExactDob = true;
    } else {
      const validYears = actor.movies.map(m => m.year).filter(y => y && y > 1900 && y <= 2030);
      actorDob = validYears.length ? Math.min(...validYears) - 22 : 1970;
    }

    // Top = Early DOB (e.g. 1910s - NTR, ANR, S.V. Ranga Rao), Bottom = Recent DOB (e.g. 1990s/2000s - Vijay Deverakonda, Nani)
    const actorY = (2030 - actorDob) * 1800 + (Math.random() - 0.5) * 1200;
    const actorX = -60000 + (Math.random() - 0.5) * 35000;

    graph.addNode(`actor_${actor.id}`, {
      label: actor.name,
      size: Math.min(nodeSize, 8),
      color: actorColor,
      nodeType: 'actor',
      data: {
        ...actor,
        dobYear: actorDob,
        dobLabel: isExactDob ? `${actorDob}` : `c. ${actorDob}`,
        profile_url: actor.profile_path ? `${TMDB_BASE_URL}${actor.profile_path}` : null
      },
      x: actorX,
      y: actorY
    });

    // Edges
    const edgeOpacity = Math.min(0.4, 0.15 + (numMovies * 0.005));
    const edgeColor = `rgba(92, 45, 18, ${edgeOpacity})`;

    actor.movies.forEach(m => {
      const movieId = `movie_${m.movie_id}`;
      if (graph.hasNode(movieId) && !graph.hasEdge(`actor_${actor.id}`, movieId)) {
        graph.addEdge(`actor_${actor.id}`, movieId, {
          size: 0.15,
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

  // --- ANTI-OVERLAP RELAXATION ALGORITHM ---
  const iterations = 5;
  const cellSize = 1200;

  for (let it = 0; it < iterations; it++) {
    const grid = new Map();
    const nodesList = graph.nodes();

    for (const nodeId of nodesList) {
      const p = graph.getNodeAttributes(nodeId);
      const gx = Math.floor(p.x / cellSize);
      const gy = Math.floor(p.y / cellSize);
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(nodeId);
    }

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

            const minDist = (p.size + q.size) * 80 + 200;

            if (d < minDist) {
              const push = (minDist - d) * 0.5;
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

  return graph;
}
