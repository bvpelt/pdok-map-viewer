// In your src/app/core/map/map.interface.ts file
export interface TileMatrixSet {
  id: string;
  title?: string;
  supportedCRS: string;
  crs: string;
  tileMatrices: TileMatrix[]; // Changed from tileMatrix to tileMatrices
  boundingBox?: {
    lowerLeft: number[];
    upperRight: number[];
  };
}

export interface TileMatrix {
  id: string;
  scaleDenominator: number;
  tileWidth: number;
  tileHeight: number;
  matrixWidth: number;
  matrixHeight: number;
  cellSize: number;
  cornerOfOrigin?: string;
  pointOfOrigin: number[];
}

export interface OGCCollection {
  id: string;
  title: string;
  description?: string;
  extent?: any;
  links: any[];
}
