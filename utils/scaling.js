// /Users/chirag/Downloads/Test App - Coding/PortfolioProApp/utils/scaling.js
import { Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// --- Dynamic Scaling ---
// You can adjust BASE_SCREEN_WIDTH as per your design's reference screen width.
// For instance, if your designs are based on a typical phone width.
const BASE_SCREEN_WIDTH = 375; // A common phone width reference (e.g., iPhone 8/SE)
const MAX_EFFECTIVE_SCREEN_WIDTH = 480; // Cap scaling at a large phone/small tablet width

// Use the smaller of the actual screen width or our max effective width for scaling
const effectiveScreenWidth = Math.min(screenWidth, MAX_EFFECTIVE_SCREEN_WIDTH);
const scaleFactor = effectiveScreenWidth / BASE_SCREEN_WIDTH;

// Scales a size based on the screen width.
// Ensures a minimum size to prevent elements from becoming too small.
export const scaleSize = (size) => Math.max(10, Math.round(size * scaleFactor));

// Scales a font size based on the screen width.
// Ensures a minimum font size for readability.
export const scaleFont = (size) => Math.max(12, Math.round(size * scaleFactor));

// Scales a layout value (like padding, margin) based on the screen width.
// Allows for smaller minimums than scaleSize, suitable for fine-tuning layouts.
export const scaleLayoutValue = (size) => Math.max(1, Math.round(size * scaleFactor));

export { screenWidth, screenHeight };