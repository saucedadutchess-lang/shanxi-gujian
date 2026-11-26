// 万荣稷王庙大殿：按徐怡涛 2014 年论文里的尺寸生成的示意模型（四座单檐庑殿殿共用 src/wudian/）。
import model from '../../data/models/jiwang.json';
import type { ModelTable } from '../model/kit';
import { basisDesc, startWudian } from '../wudian/page';

startWudian({
  name: 'jiwang',
  table: model as unknown as ModelTable,
  order: '自西向东',
  corner: [1, '东南角'],
  basisDesc: basisDesc('徐怡涛 2014 年论文里写出的数和做法'),
});
