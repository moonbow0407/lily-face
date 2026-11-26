/*
 * 呈现层：名字与配色。加载界面、提示文字用引擎的通用默认值；
 * 需要定制时可加 text: { title, loading, ... } 和 images: { loading, finale, finaleAlt }（图片放在 public/）。
 */
import theme from './theme.js';

export default {
  name: '莉莉',
  images: {
    finale: '/finale-lily.jpg', // 音游结算图：官方立绘 public/lily.png 的上半身方形裁切
    finaleAlt: '莉莉',
  },
  theme: theme.css,
  outline: theme.outline,
};
