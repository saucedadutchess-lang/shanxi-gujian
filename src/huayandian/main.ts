// 华严寺大雄宝殿：按周乾 2023 年论文里的尺寸生成的示意模型（四座单檐庑殿殿共用 src/wudian/）。
import model from '../../data/models/huayandian.json';
import type { ModelTable } from '../model/kit';
import { basisDesc, startWudian } from '../wudian/page';

startWudian({
  name: 'huayandian',
  table: model as unknown as ModelTable,
  order: '从正面看自左向右，左手是南',
  corner: [-1, '东南角'],
  basisDesc: basisDesc('周乾 2023 年论文里写出的数，或从论文图上量的'),
});
