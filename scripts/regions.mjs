// 四个片区按地级市划分。这是本项目为了组织路线定的划法，不是行政区划。
// 跨两个市的单位（如长城各段）取名录里写在前面的市。
export const REGIONS = {
  晋北: ['大同市', '朔州市', '忻州市'],
  晋中: ['太原市', '晋中市', '阳泉市', '吕梁市'],
  晋东南: ['长治市', '晋城市'],
  晋南: ['临汾市', '运城市'],
};

export function regionOf(prefecture) {
  const first = prefecture.split(/[、，,]/)[0];
  for (const [region, cities] of Object.entries(REGIONS)) if (cities.includes(first)) return region;
  throw new Error(`不认识的地级市：${prefecture}`);
}
