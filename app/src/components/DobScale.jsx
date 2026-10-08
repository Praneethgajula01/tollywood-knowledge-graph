import { useEffect, useState, useCallback } from 'react';
import { useSigma } from '@react-sigma/core';

// Standard 10-year markings for birth years
const YEARS = [1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

const DobScale = () => {
  const sigma = useSigma();
  const [ticks, setTicks] = useState([]);

  const updateScale = useCallback(() => {
    if (!sigma) return;
    try {
      const newTicks = YEARS.map(year => {
        const graphY = (2030 - year) * 1800;
        const pos = sigma.graphToViewport({ x: -45000, y: graphY });
        return {
          year,
          y: pos.y,
          graphY
        };
      });
      setTicks(newTicks);
    } catch (e) {
      console.error('Scale update error:', e);
    }
  }, [sigma]);

  useEffect(() => {
    if (!sigma) return;
    updateScale();
    const camera = sigma.getCamera();
    camera.on('updated', updateScale);
    return () => {
      camera.off('updated', updateScale);
    };
  }, [sigma, updateScale]);

  const jumpToYear = (year) => {
    if (!sigma) return;
    const camera = sigma.getCamera();
    const targetY = (2030 - year) * 1800;
    camera.animate(
      { x: -40000, y: targetY },
      { duration: 500 }
    );
  };

  return (
    <div className="simple-scale-container">
      <div className="simple-scale-axis-line"></div>
      <div className="simple-scale-title">YEAR</div>
      {ticks.map(tick => {
        if (tick.y < -30 || tick.y > window.innerHeight + 30) return null;
        return (
          <div
            key={tick.year}
            className="simple-scale-tick-wrap"
            style={{ top: `${tick.y}px` }}
            onClick={() => jumpToYear(tick.year)}
            title={`Jump to year ${tick.year}`}
          >
            <div className="simple-scale-tick"></div>
            <span className="simple-scale-label">{tick.year}</span>
          </div>
        );
      })}
    </div>
  );
};

export default DobScale;
