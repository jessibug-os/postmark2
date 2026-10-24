import { assets } from '../../core/AssetLoader';

/** Stable W2 seam backed by the W4 authored-asset registry. */
export const createAlbertModel = () => assets.model('albert');
