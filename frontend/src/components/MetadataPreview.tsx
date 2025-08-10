import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

interface Metadata {
  title: string;
  hazard_type: string;
  coordinates: [number, number];
}

interface Props {
  filename: string | null;
}

const MetadataPreview: React.FC<Props> = ({ filename }) => {
  const [data, setData] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filename) return;
    setLoading(true);
    setError(null);
    apiFetch(`/api/images/${filename}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Network response was not ok');
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
      })
      .catch((err: Error) => {
        setError(err.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [filename]);

  if (!filename) {
    return <div>No image selected</div>;
  }
  if (loading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Error loading metadata</div>;
  }
  if (!data) {
    return null;
  }
  return (
    <div>
      <h3>{data.title}</h3>
      <p>Hazard: {data.hazard_type}</p>
      <p>Coordinates: {data.coordinates.join(', ')}</p>
    </div>
  );
};

export default MetadataPreview;
