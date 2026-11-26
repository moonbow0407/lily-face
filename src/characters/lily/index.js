/*
 * 角色：莉莉
 *   model.js         模型层：材质、骨骼、表情名、坐标校准
 *   expressions.js   表情表：每个动作的招牌表情 + 变体
 *   personality.js   开放的动作、反应节奏、彩蛋
 *   presentation.js  名字与配色（theme.js）
 */
import model from './model.js';
import personality from './personality.js';
import presentation from './presentation.js';

export default { id: 'lily', model, personality, presentation };
