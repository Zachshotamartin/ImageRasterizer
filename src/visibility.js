export const RENDER_MARGIN = 80;

// Match the observer's expanded viewport before its asynchronous first delivery.
export function isWithinRenderMargin(rect, viewportWidth, viewportHeight) {
  return rect.width > 0 && rect.height > 0 &&
    rect.right >= -RENDER_MARGIN && rect.bottom >= -RENDER_MARGIN &&
    rect.left <= viewportWidth + RENDER_MARGIN && rect.top <= viewportHeight + RENDER_MARGIN;
}
