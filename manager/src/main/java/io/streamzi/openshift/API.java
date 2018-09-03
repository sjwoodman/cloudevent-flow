package io.streamzi.openshift;


import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.fabric8.kubernetes.api.model.ConfigMap;
import io.fabric8.kubernetes.api.model.ConfigMapList;
import io.fabric8.kubernetes.api.model.ObjectMeta;
import io.fabric8.kubernetes.api.model.apiextensions.CustomResourceDefinition;
import io.streamzi.openshift.dataflow.model.ProcessorConstants;
import io.streamzi.openshift.dataflow.model.ProcessorNodeTemplate;
import io.streamzi.openshift.dataflow.model.crds.*;
import io.streamzi.openshift.dataflow.model.serialization.ProcessorTemplateYAMLWriter;
import io.streamzi.openshift.dataflow.model.serialization.SerializedFlow;

import javax.ejb.EJB;
import javax.enterprise.context.ApplicationScoped;
import javax.ws.rs.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/**
 * @author hhiden
 */
@ApplicationScoped
@Path("/api")
public class API {
    private static final Logger logger = Logger.getLogger(API.class.getName());

    private final ObjectMapper MAPPER = new ObjectMapper();


    @EJB(beanInterface = ClientContainer.class)
    private ClientContainer container;

    private final String bootstrapServersDefault = "my-cluster-kafka:9092";
    private final String brokerUrlDefault = "amqp://dispatch.myproject.svc:5672";

    @GET
    @Path("/pods")
    @Produces("application/json")
    public List<String> listPods() {
        return container.getOSClient().pods().inNamespace(container.getNamespace()).list()
                .getItems()
                .stream()
                .map(pod -> pod.getMetadata().getName())
                .collect(Collectors.toList());
    }

    @GET
    @Path("/dataflows/{name}")
    @Produces("application/json")
    public String getProcessorFlowDeployment(@PathParam("name") String name) throws Exception {

        final CustomResourceDefinition flowCRD = container.getOSClient().customResourceDefinitions().withName("flows.streamzi.io").get();
        if (flowCRD == null) {
            logger.severe("Can't find Flow CRD");
            return "";
        }

        return MAPPER.writeValueAsString(container.getOSClient().customResources(
                flowCRD,
                Flow.class,
                FlowList.class,
                DoneableFlow.class)
                .inNamespace(container.getOSClient().getNamespace())
                .withName(name).get());

    }

    @GET
    @Path("/dataflows")
    @Produces("application/json")
    public List<String> listFlows() {
        final CustomResourceDefinition flowCRD = container.getOSClient().customResourceDefinitions().withName("flows.streamzi.io").get();
        if (flowCRD == null) {
            logger.severe("Can't find Flow CRD");
            return Collections.emptyList();
        }

        return container.getOSClient().customResources(
                flowCRD,
                Flow.class,
                FlowList.class,
                DoneableFlow.class)
                .inNamespace(container.getOSClient().getNamespace()).list().getItems().stream()
                .map(flow -> flow.getMetadata().getName())
                .collect(Collectors.toList());
    }

    @GET
    @Path("/processors")
    @Produces("application/json")
    public List<String> listProcessors() {

        final CustomResourceDefinition procCRD = container.getOSClient().customResourceDefinitions().withName("processors.streamzi.io").get();
        if (procCRD == null) {
            logger.severe("Can't find CRD");
            return Collections.emptyList();
        }

        return container.getOSClient().customResources(
                procCRD,
                Processor.class,
                ProcessorList.class,
                DoneableProcessor.class)
                .inNamespace(container.getOSClient().getNamespace())
                .list().getItems()
                .stream()
                .map(proc -> {
                    final ProcessorNodeTemplate template = new ProcessorNodeTemplate(proc);
                    final ProcessorTemplateYAMLWriter writer = new ProcessorTemplateYAMLWriter(template);
                    try {
                        return writer.writeToYAMLString();
                    } catch (Exception e) {
                        e.printStackTrace();
                        return "";
                    }

                })
                .collect(Collectors.toList());
    }


    /**
     * Upload a new Custom Resource
     */
    @POST
    @Path("/flows")
    @Consumes("application/json")
    public void postFlow(String flowJson) {
        logger.info(flowJson);
        try {

            SerializedFlow serializedFlow = MAPPER.readValue(flowJson, SerializedFlow.class);
            logger.info("Flow Parsed OK");

            Flow customResource = new Flow();

            ObjectMeta metadata = new ObjectMeta();
            metadata.setName(serializedFlow.getName());
            customResource.setMetadata(metadata);
            customResource.setSpec(serializedFlow);

            final CustomResourceDefinition flowCRD = container.getOSClient().customResourceDefinitions().withName("flows.streamzi.io").get();

            container.getOSClient().customResources(flowCRD, Flow.class, FlowList.class, DoneableFlow.class).inNamespace(container.getNamespace()).createOrReplace(customResource);

            logger.info("Flow written OK");

        } catch (Exception e) {
            logger.log(Level.SEVERE, "Error parsing JSON flow data: " + e.getMessage(), e);
        }
    }

    @GET
    @Path("/globalproperties")
    @Produces("application/json")
    public String getGlobalProperties() {
        final Properties props = new Properties();

        String bootstrapServers = EnvironmentResolver.get(ProcessorConstants.KAFKA_BOOTSTRAP_SERVERS);
        if (bootstrapServers != null && !bootstrapServers.equals("")) {
            props.put(ProcessorConstants.KAFKA_BOOTSTRAP_SERVERS, bootstrapServers);
        } else {
            props.put(ProcessorConstants.KAFKA_BOOTSTRAP_SERVERS, bootstrapServersDefault);
        }

        String brokerUrl = EnvironmentResolver.get("broker.url");
        if (brokerUrl != null && !brokerUrl.equals("")) {
            props.put("broker.url", brokerUrl);
        } else {
            props.put("broker.url", brokerUrlDefault);
        }

        try {
            return MAPPER.writeValueAsString(props);
        } catch (JsonProcessingException e) {
            logger.severe(e.getMessage());
            return "{}";
        }
    }

    //todo: Have these been replaced by CRs in Strimzi?
    @GET
    @Path("/topics")
    @Produces("application/json")
    public List<String> listTopics() {
        ConfigMapList list = container.getOSClient().configMaps().withLabel("strimzi.io/kind", "topic").list();

        ArrayList<String> results = new ArrayList<>();
        for (ConfigMap cm : list.getItems()) {
            if (cm.getMetadata().getLabels().containsKey("streamzi.io/source")) {
                // This is one of ours - add it if it wasn't autocreated
                String source = cm.getMetadata().getLabels().get("streamzi.io/source");
                if (source == null || source.isEmpty() || !source.equalsIgnoreCase("autocreated")) {
                    results.add(cm.getMetadata().getName());
                }
            } else {
                results.add(cm.getData().get("name"));
            }
        }
        return results;
    }
}
