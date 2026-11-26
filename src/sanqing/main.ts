// 永乐宫三清殿：按杜仙洲 1963 年文章里的尺寸生成的示意模型（四座单檐庑殿殿共用 src/wudian/）。
import model from '../../data/models/sanqing.json';
import type { ModelTable } from '../model/kit';
import { basisDesc, startWudian } from '../wudian/page';

startWudian({
  name: 'sanqing',
  table: model as unknown as ModelTable,
  order: '自西向东',
  corner: [1, '东南角'],
  basisDesc: basisDesc('杜仙洲 1963 年文章里写出的数'),
});
