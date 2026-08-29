import type { Connector } from "./types";

/**
 * Central lookup for active connector instances by connector id.
 * Adapters register themselves here at startup; the routing engine
 * resolves a connector purely by id/capability, never by type-checking.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    this.connectors.set(connector.id, connector);
  }

  get(connectorId: string): Connector {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`No connector registered with id "${connectorId}"`);
    }
    return connector;
  }

  list(): Connector[] {
    return Array.from(this.connectors.values());
  }
}

export const connectorRegistry = new ConnectorRegistry();
