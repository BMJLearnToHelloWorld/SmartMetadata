/**
 * Official useGlossaryTreeData / GlossaryTermPicker: glossaries at the root,
 * terms lazy-loaded per level via directChildrenOf (FQNs as values).
 */
import { listGlossaries } from '@/api/glossaries';
import { listGlossaryTermChildrenLazy } from '@/api/glossaryTerms';
import { PAGE_SIZE_EXTRA_LARGE } from '@/utils/pagination';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import type { GlossaryTerm } from '@/types/governance';

export const GLOSSARY_PICKER_CHILD_PAGE_SIZE = 50;

export interface GlossaryTreeSelectNode {
  value: string;
  title: string;
  key: string;
  isLeaf?: boolean;
  disableCheckbox?: boolean;
  selectable?: boolean;
  children?: GlossaryTreeSelectNode[];
}

function termIsLeaf(term: GlossaryTerm): boolean {
  const count = term.childrenCount ?? 0;
  return count <= 0;
}

export function glossaryTermToTreeNode(term: GlossaryTerm): GlossaryTreeSelectNode {
  const fqn = term.fullyQualifiedName ?? term.name;
  return {
    key: fqn,
    value: fqn,
    title: getEntityName(term),
    isLeaf: termIsLeaf(term),
  };
}

export async function loadGlossaryPickerRoots(): Promise<GlossaryTreeSelectNode[]> {
  const page = await listGlossaries({ limit: PAGE_SIZE_EXTRA_LARGE });
  return page.data.map((glossary) => {
    const fqn = glossary.fullyQualifiedName ?? glossary.name;
    return {
      key: fqn,
      value: fqn,
      title: getEntityName(glossary),
      isLeaf: false,
      disableCheckbox: true,
      selectable: false,
    };
  });
}

export async function loadGlossaryPickerChildren(parentFqn: string): Promise<GlossaryTreeSelectNode[]> {
  const page = await listGlossaryTermChildrenLazy(parentFqn, GLOSSARY_PICKER_CHILD_PAGE_SIZE);
  return page.data.map(glossaryTermToTreeNode);
}