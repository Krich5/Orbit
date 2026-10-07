// src/utils/autoLayout.js

const getLayoutedElements = (nodes, edges) => {
  // --- CONFIGURATION ---
  const NODE_WIDTH = 300; 
  const NODE_HEIGHT = 160; 
  const X_SPACING = 600;   // Wide gap for lines to curve
  const Y_SPACING = 120;   // Vertical gap between siblings

  // 1. Initialize Graph
  const graph = {};
  nodes.forEach(n => {
    graph[n.id] = { 
      ...n, 
      children: [], 
      measuredHeight: 0, 
      x: 0, 
      y: 0 
    };
  });

  // 2. Sort Edges to prioritize "Happy Paths"
  // This helps keep the main flow straight and error paths to the bottom
  const getEdgeScore = (edge) => {
    const label = (edge.sourceHandle || '').toLowerCase();
    if (['success', 'default', 'true', '1', '2', '3'].some(t => label.includes(t))) return 2;
    if (['error', 'timeout', 'invalid', 'failure'].some(t => label.includes(t))) return 0;
    return 1;
  };

  const sortedEdges = [...edges].sort((a, b) => getEdgeScore(b) - getEdgeScore(a));

  // 3. Build Spanning Tree (BFS) - Breaks Cycles
  const visited = new Set();
  const nodeHasParent = new Set();
  const roots = [];

  // Identify natural roots (Start Node, Event Nodes, or Orphans)
  const targets = new Set(edges.map(e => e.target));
  
  // Explicitly find StartNode or Event headers first
  const explicitRoots = nodes.filter(n => n.type === 'StartNode' || n.data?.isEventNode || n.type === 'groupHeader');
  
  // Add explicit roots to queue first
  const queue = [...explicitRoots.map(n => n.id)];
  
  // Add any orphans (nodes with no incoming edges)
  nodes.forEach(n => {
    if (!targets.has(n.id) && !queue.includes(n.id)) {
      queue.push(n.id);
    }
  });

  // Fallback: If circular graph with no start, pick the first node
  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0].id);
  }

  // Process Queue to build tree
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (visited.has(parentId)) continue;
    visited.add(parentId);
    
    // Check if this was a root (not added as a child of someone else)
    if (!nodeHasParent.has(parentId)) {
      roots.push(parentId);
    }

    const myEdges = sortedEdges.filter(e => e.source === parentId);
    
    myEdges.forEach(edge => {
      const childId = edge.target;
      // If child exists and hasn't been "claimed" by a parent yet in this tree walk
      if (graph[childId] && !nodeHasParent.has(childId)) {
        nodeHasParent.add(childId);
        graph[parentId].children.push(childId);
        queue.push(childId);
      }
    });
  }

  // 4. Measure Phase (Post-Order Traversal)
  // Calculates the bounding box height of every subtree
  const measureNode = (nodeId) => {
    const node = graph[nodeId];
    if (!node) return 0;

    if (node.children.length === 0) {
      node.measuredHeight = NODE_HEIGHT + Y_SPACING;
      return node.measuredHeight;
    }

    let totalHeight = 0;
    node.children.forEach(childId => {
      totalHeight += measureNode(childId);
    });

    node.measuredHeight = Math.max(NODE_HEIGHT + Y_SPACING, totalHeight);
    return node.measuredHeight;
  };

  // 5. Place Phase (Pre-Order Traversal)
  const placeNode = (nodeId, x, y) => {
    const node = graph[nodeId];
    if (!node) return;

    node.x = x;

    if (node.children.length > 0) {
      let currentChildY = y;
      
      node.children.forEach(childId => {
        placeNode(childId, x + X_SPACING, currentChildY);
        currentChildY += graph[childId].measuredHeight;
      });

      // Center Parent relative to first and last child
      const firstChild = graph[node.children[0]];
      const lastChild = graph[node.children[node.children.length - 1]];
      
      if (firstChild && lastChild) {
        node.y = (firstChild.y + lastChild.y) / 2;
      } else {
        node.y = y;
      }
    } else {
      node.y = y;
    }
  };

  // 6. Execution Loop
  let globalCursorY = 0;

  // Sort roots to process Main Flow (StartNode) first
  roots.sort((a, b) => {
    const nodeA = graph[a];
    const nodeB = graph[b];
    const isEventA = nodeA.data?.isEventNode || nodeA.type === 'groupHeader';
    const isEventB = nodeB.data?.isEventNode || nodeB.type === 'groupHeader';
    return isEventA - isEventB; // Main flow (0) comes before Event flow (1)
  });

  roots.forEach(rootId => {
    if (graph[rootId]) {
      measureNode(rootId);
      placeNode(rootId, 0, globalCursorY);
      
      // Move cursor down for next tree, plus gap
      globalCursorY += graph[rootId].measuredHeight + 300;
    }
  });

  // 7. Map to React Flow format
  const finalNodes = nodes.map(node => {
    const gNode = graph[node.id];
    
    // Safety check: If node was somehow missed (shouldn't happen with full orphan check),
    // keep it at 0,0 or map it
    const x = gNode.x || 0;
    const y = gNode.y || 0;

    return {
      ...node,
      targetPosition: 'left',
      sourcePosition: 'right',
      position: { x, y }
    };
  });

  return { nodes: finalNodes, edges };
};

if (typeof window !== 'undefined') {
  window.getAutoLayoutedElements = getLayoutedElements;
}

export { getLayoutedElements };
