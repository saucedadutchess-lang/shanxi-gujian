// 善化寺大雄宝殿：资料很少，按材广、椽架和《营造法式》推测的示意模型（四座单檐庑殿殿共用 src/wudian/）。
import model from '../../data/models/shanhuadian.json';
import type { ModelTable } from '../model/kit';
import { basisDesc, startWudian } from '../wudian/page';

startWudian({
  name: 'shanhuadian',
  table: model as unknown as ModelTable,
  order: '自西向东',
  corner: [1, '东南角'],
  basisDesc: basisDesc('资料里写出的数或做法'),
});
