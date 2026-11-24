/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import type { Edge, Node } from '@vue-flow/core';
import type { EntityRef } from '@/types/api';

/**
 * Ports lineage graph layout (Q-TAB-4, L3d).
 *
 * Pin `PortsLineageView.component.tsx` (`buildNodesAndEdges`,
 * a3012259ca) builds its own three-column ReactFlow graph — it does NOT
 * reuse the entity-lineage canvas — with a data-product center node,
 * input ports on the left and output ports on the right. The constants
 * and geometry below are pin's, verbatim: NODE_WIDTH 240, NODE_HEIGHT
 * 120, VERTICAL_SPACING 20, HORIZONTAL_SPACING 200; center x =
 * HORIZONTAL_SPACING + NODE_WIDTH (440), output x =
 * 2 * (HORIZONTAL_SPACING + NODE_WIDTH) (880); edges are `smoothstep`
 * with an ArrowClosed marker. Handle ids are pin's too: a port handle is
 * the port's fullyQualifiedName (falling back to its id), the center
 * handles are `${productId}-left` (target) / `${productId}-right`
 * (source).
 *
 * Ports arrive as `EntityRef`s (the product `getDataProductPortsView`
 * already parses portsView into `Paged<EntityRef>` per side); pin wraps
 * them in a search-hit shape (`{ _id, _index, _source }`) that has no
 * product equivalent, so the graph consumes the refs directly.
 */
export const PORTS_LINEAGE_NODE_WIDTH = 240;
export const PORTS_LINEAGE_NODE_HEIGHT = 120;
export const PORTS_LINEAGE_VERTICAL_SPACING = 20;
export const PORTS_LINEAGE_HORIZONTAL_SPACING = 200;

export const PORTS_LINEAGE_CENTER_NODE_ID = 'data-product-center';

/** Pin `getPortHandleId`: fqn, falling back to id. */
export function portsLineageHandleId(port: EntityRef): string {
  return port.fullyQualifiedName ?? port.id ?? '';
}

export interface PortsLineagePortNodeData {
  /** The port entity; the node renders its name + type. */
  port: EntityRef;
  isInputPort: boolean;
  handleId: string;
  /** Stable test id for the node (`port-node-${fqn}`, pin PortNode). */
  testId: string;
}

export interface PortsLineageDataProductNodeData {
  /** The data product; the node renders its name. */
  dataProduct: { id: string; name: string; displayName?: string; fullyQualifiedName?: string };
  /** Stable test id for the center node (pin DataProductNode). */
  testId: string;
}

export interface PortsLineageGraph {
  nodes: Node<PortsLineagePortNodeData | PortsLineageDataProductNodeData>[];
  edges: Edge[];
}

export function buildPortsLineageGraph(
  dataProduct: { id: string; name: string; displayName?: string; fullyQualifiedName?: string },
  inputPorts: EntityRef[],
  outputPorts: EntityRef[],
): PortsLineageGraph {
  const nodes: Node<PortsLineagePortNodeData | PortsLineageDataProductNodeData>[] = [];
  const edges: Edge[] = [];

  const maxPortCount = Math.max(inputPorts.length, outputPorts.length, 1);
  const totalHeight = maxPortCount * (PORTS_LINEAGE_NODE_HEIGHT + PORTS_LINEAGE_VERTICAL_SPACING);
  const centerY = totalHeight / 2;

  nodes.push({
    id: PORTS_LINEAGE_CENTER_NODE_ID,
    type: 'dataProductNode',
    position: {
      x: PORTS_LINEAGE_HORIZONTAL_SPACING + PORTS_LINEAGE_NODE_WIDTH,
      y: centerY - 50,
    },
    data: { dataProduct, testId: 'data-product-center-node' },
    draggable: false,
  });

  const portNodes = (
    ports: EntityRef[],
    isInputPort: boolean,
    x: number,
  ): void => {
    ports.forEach((port, index) => {
      const handleId = portsLineageHandleId(port);
      const yPosition =
        index * (PORTS_LINEAGE_NODE_HEIGHT + PORTS_LINEAGE_VERTICAL_SPACING) +
        (totalHeight - ports.length * (PORTS_LINEAGE_NODE_HEIGHT + PORTS_LINEAGE_VERTICAL_SPACING)) / 2;
      const nodeId = `${isInputPort ? 'input' : 'output'}-${handleId}`;
      nodes.push({
        id: nodeId,
        type: 'portNode',
        position: { x, y: yPosition },
        data: {
          port,
          isInputPort,
          handleId,
          testId: `port-node-${port.fullyQualifiedName ?? port.id ?? ''}`,
        },
        draggable: false,
      });
      edges.push(
        isInputPort
          ? {
              id: `edge-${nodeId}-to-center`,
              source: nodeId,
              target: PORTS_LINEAGE_CENTER_NODE_ID,
              sourceHandle: handleId,
              targetHandle: `${dataProduct.id}-left`,
              type: 'smoothstep',
            }
          : {
              id: `edge-center-to-${nodeId}`,
              source: PORTS_LINEAGE_CENTER_NODE_ID,
              target: nodeId,
              sourceHandle: `${dataProduct.id}-right`,
              targetHandle: handleId,
              type: 'smoothstep',
            },
      );
    });
  };

  portNodes(inputPorts, true, 0);
  portNodes(
    outputPorts,
    false,
    2 * (PORTS_LINEAGE_HORIZONTAL_SPACING + PORTS_LINEAGE_NODE_WIDTH),
  );

  return { nodes, edges };
}
