import React, { useState } from 'react';
import MetadataPreview from '../components/MetadataPreview';

const images = ['image1.jpg', 'image2.jpg', 'image3.jpg'];

const IndexPage: React.FC = () => {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div>
      <ul>
        {images.map((img) => (
          <li key={img}>
            <button onClick={() => setSelected(img)}>{img}</button>
          </li>
        ))}
      </ul>
      <MetadataPreview filename={selected} />
    </div>
  );
};

export default IndexPage;
