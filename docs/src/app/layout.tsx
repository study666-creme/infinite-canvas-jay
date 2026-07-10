import { Provider } from '@/components/provider';
import './global.css';

export const metadata = {
  title: {
    default: '卡藏提示词画布文档',
    template: '%s | 卡藏提示词画布',
  },
  description: '卡藏提示词画布的使用、部署、Agent、3D 导演台、数据与开源说明。',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
