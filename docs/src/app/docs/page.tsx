import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { Markdown } from 'fumadocs-core/content/md';
import { getTableOfContents } from 'fumadocs-core/content/toc';
import { remarkHeading } from 'fumadocs-core/mdx-plugins';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { getMDXComponents } from '@/components/mdx';

const title = '卡藏提示词画布文档';
const description = '使用、部署、画布 Agent、3D 导演台、数据、安全与开源说明';

async function readDocsIndex() {
  return readFile(join(process.cwd(), 'index.md'), 'utf8');
}

export default async function Page() {
  const content = await readDocsIndex();
  const toc = getTableOfContents(content);

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{title}</DocsTitle>
      <DocsDescription>{description}</DocsDescription>
      <DocsBody>
        <Markdown components={getMDXComponents()} remarkPlugins={[remarkHeading]}>
          {content}
        </Markdown>
      </DocsBody>
    </DocsPage>
  );
}

export function generateMetadata(): Metadata {
  return {
    title,
    description,
  };
}
