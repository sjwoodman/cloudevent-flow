/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package io.streamzi.openshift.dataflow.container.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jdk8.Jdk8Module;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.cloudevents.CloudEvent;
import io.cloudevents.impl.DefaultCloudEventImpl;
import io.streamzi.openshift.dataflow.container.CloudEventInput;
import io.streamzi.openshift.dataflow.container.config.EnvironmentResolver;
import io.streamzi.openshift.dataflow.model.ProcessorConstants;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;
import static org.apache.kafka.clients.CommonClientConfigs.*;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.errors.WakeupException;
import org.apache.kafka.common.serialization.StringDeserializer;

/**
 * Connects to a Kafka topic to get cloud events
 *
 * @author hhiden
 */
public class KafkaCloudEventInputImpl extends CloudEventInput implements Runnable {
    private static final Logger logger = Logger.getLogger(KafkaCloudEventInputImpl.class.getName());
    private ObjectMapper mapper;
    
    private Consumer<String, String> consumer;
    private String topicName;
    private String bootstrapServers;
    private volatile boolean stopInput = false;
    private Thread pollThread;

    public KafkaCloudEventInputImpl(Object consumerObject, Method consumerMethod) {
        super(consumerObject, consumerMethod);
        bootstrapServers = EnvironmentResolver.get(ProcessorConstants.KAFKA_BOOTSTRAP_SERVERS);
        logger.info("Kafka broker defined at: " + bootstrapServers);
        topicName = EnvironmentResolver.get(inputName);   // Passed if from deployer via env variable
        logger.info("Input will connect to topic: " + topicName);
        
        mapper = new ObjectMapper();
        mapper.registerModule(new Jdk8Module());
        mapper.registerModule(new JavaTimeModule());
        mapper.configure(SerializationFeature.INDENT_OUTPUT, true);
        mapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);           
    }

    @Override
    public void startInput() {
        logger.info("Starting input: " + inputName);
        if (consumer == null) {
            consumer = createConsumer();
            pollThread = new Thread(this);
            pollThread.setDaemon(true);
            pollThread.start();
        }

    }

    @Override
    public void run() {
        try {
            while (!stopInput) {

                final ConsumerRecords<String, String> records = consumer.poll(100);
                for (ConsumerRecord<String, String> r : records) {
                    try {
                        logger.info("Read: " + r.value());
                        CloudEvent evt = mapper.readValue(r.value(), DefaultCloudEventImpl.class);
                        consumerMethod.invoke(consumerObject, evt);
                    } catch (Exception e){
                        logger.warning("Error running consumer method: " + e.getMessage());
                    }
                }
            }

        } catch (WakeupException we) {
            if (!stopInput) {
                logger.info("Wakeup exception");
                throw we;
            }
        } finally {
            consumer.close();
        }
    }

    private Consumer<String, String> createConsumer() {
        if (topicName != null && bootstrapServers != null) {
            logger.info("Attaching to topic: " + topicName);

            Properties properties = new Properties();
            properties.put(BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
            properties.put(ConsumerConfig.GROUP_ID_CONFIG, processorUuid);
            properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
            properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
            properties.put(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, 1000);
            Consumer<String, String> c = new KafkaConsumer<>(properties);
            c.subscribe(Collections.singletonList(topicName));
            return c;
        } else {
            logger.log(Level.SEVERE, "Missing configuration data");
            return null;
        }
    }

    @Override
    public void stopInput() {
        stopInput = true;
        if(consumer!=null){
            consumer.wakeup();
        }
    }
}
