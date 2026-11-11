package org.openmetadata.service.clients.pipeline.k8s;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.openmetadata.schema.api.configuration.pipelineServiceClient.Parameters;
import org.openmetadata.schema.api.configuration.pipelineServiceClient.PipelineServiceClientConfiguration;

class K8sPipelineClientAddressesPipelinesByNameTest {

  /** The namesake guard keys off this flag; a missing override silently switches it off. */
  @Test
  void addressesPipelinesByNameIsTrue() {
    K8sPipelineClient client = newClient(skipInit(true));

    assertTrue(client.addressesPipelinesByName());
  }

  private static K8sPipelineClient newClient(Parameters params) {
    PipelineServiceClientConfiguration config = new PipelineServiceClientConfiguration();
    config.setEnabled(true);
    config.setMetadataApiEndpoint("http://localhost:8585/api");
    config.setParameters(params);
    return new K8sPipelineClient(config);
  }

  private static Parameters skipInit(boolean v) {
    Parameters params = new Parameters();
    params.setAdditionalProperty("namespace", "openmetadata-pipelines");
    params.setAdditionalProperty("inCluster", "false");
    params.setAdditionalProperty("skipInit", Boolean.toString(v));
    params.setAdditionalProperty("ingestionImage", "openmetadata/ingestion:test");
    params.setAdditionalProperty("serviceAccountName", "test-sa");
    return params;
  }
}
