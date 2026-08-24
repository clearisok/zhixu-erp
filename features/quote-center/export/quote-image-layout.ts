export type ContainedImageLayout = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export function calculateContainedImageLayout(
  imageWidth: number,
  imageHeight: number,
  areaWidth: number,
  areaHeight: number,
  padding = 8,
): ContainedImageLayout {
  if (imageWidth <= 0 || imageHeight <= 0 || areaWidth <= 0 || areaHeight <= 0) {
    throw new Error("图片或款式图区尺寸无效");
  }
  const availableWidth = Math.max(1, areaWidth - padding * 2);
  const availableHeight = Math.max(1, areaHeight - padding * 2);
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    width,
    height,
    scale,
    offsetX: (areaWidth - width) / 2,
    offsetY: (areaHeight - height) / 2,
  };
}
