# 🎬 Tollywood Knowledge Graph

Welcome to the **Tollywood Knowledge Graph**! This project explores the rich and interconnected world of Telugu cinema by mapping out the relationships between movies, actors, directors, and crew members. 

By representing Tollywood as a network, we can discover fascinating insights, visualize actor collaborations, and see how the industry has evolved over time.

---

## 🧠 What is a Knowledge Graph?

A Knowledge Graph is a way of storing and organizing data not in rows and columns, but as a **network of relationships**. 

Imagine a web where:
- **Nodes** represent entities like **Movies**, **Actors**, and **Directors**.
- **Edges (Links)** represent the relationships between them (e.g., "Prabhas" *acted in* "Baahubali", or "S.S. Rajamouli" *directed* "RRR").

Instead of just searching for a movie, a Knowledge Graph allows you to ask complex, interconnected questions like:
> *"Which actors frequently collaborate with this director?"* or *"How are these two actors connected through mutual co-stars?"*

---

## 🎞️ Data Source: TMDB

All the data powering this knowledge graph is sourced from **[The Movie Database (TMDB)](https://www.themoviedb.org/)**. 

TMDB is a community-built movie and TV database. Every piece of data has been added by users dating back to 2008. The data collection scripts in this repository (`collect_telugu_movies.py`, `enrich_dataset.py`) interact with the TMDB API to fetch:
- Telugu movie metadata (Titles, Release Dates, Posters)
- Cast & Crew details
- Collaboration histories

> **Note:** This product uses the TMDB API but is not endorsed or certified by TMDB.

---

## 💻 Tech Stack

This project is divided into two main parts: Data Collection/Processing and the Web Application Interface.

### 🐍 Data Pipeline (Python)
The backend scripts are responsible for fetching, parsing, and structuring the TMDB data into graph format.
- **Python 3**
- **Requests:** For querying the TMDB API.
- **JSON:** For local caching and data storage.
- Custom algorithms to compute collaboration axes and graph edges.

### ⚛️ Frontend Web App (React)
The frontend visualizes the generated graph data in an interactive web application.
- **React.js:** For building the interactive user interface.
- **Vite:** Next-generation frontend tooling for fast builds.
- **CSS3 / HTML5:** For styling and structure.
- *(Any graph visualization libraries you may have added, e.g., D3.js, Cytoscape, or React Force Graph)*

---

## 🚀 Getting Started

To run the web application locally:

1. Navigate to the `app` directory:
   ```bash
   cd app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

Enjoy exploring the Tollywood Knowledge Graph! 🍿
