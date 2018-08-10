# cloudevent-flow
Simple dataflow for CloudEvents

## Manager/Watcher Installation


1. Deploy [Strimzi](http://strimzi.io).

2. Deploy the EnvironmentVariable Operator as this project uses it to inject the configuration from ConfigMaps

If you have the [OCP Broker](https://github.com/project-streamzi/ocp-broker) installed the Environment Variable Operator will be available from the Service Catalog.
If not, follow the steps below.

```bash
$ git clone https://github.com/project-streamzi/EnvironmentVariableOperator.git
$ cd EnvironmentVariableOperator
$ oc login -u system:admin
$ oc adm policy add-cluster-role-to-user cluster-admin system:serviceaccount:myproject:default
$ oc login -u developer
$ mvn clean pacakge fabric8:deploy -Popenshift
```

Install the Manager and Watcher components by running `mvn clean package fabric8:deploy` in the `manager` and `watcher` directories.
The Manager contains the UI and API to support it - the API will create a ConfigMap containing the abstract flow in OpenShift. 
The Watcher will be notified of the presence of the flow `ConfigMap` and will deploy the necessary components (DeploymentConfigs and ConfigMaps).

The Manager can be run outside OpenShift using `mvn clean package wildfly-swarm:run`.
The Watch can be run outside OpenShift using `mvn clean package; java -jar target/FlowController.jar`.

## Operations Installation

Run `mvn package` from the `./operations` directory. 
This will deploy the Java based operations.

TODO: how to deploy the Node.js operations?
 
## Apache Qpid Dispatch Router Installation

To install a single Dispatch Router run the `build.sh` from the `dispatch/router` directory.

To install a mesh of routers (two) run the `build.sh` from the `dispatch/routerA` and `dispatch\routerB` directories.

Then add an image to your project.
Add To Project ->  Deploy Image. 
Namespace: myproject, ImageStream: dispatch, tag: latest. 
This will create a Dispatch Router with service name `dispatch.myproject.svc` which can be used with the endpoint `amqp://dispatch.myproject.svc:5672`.
This endpoint is set as default in the `API#getGlobalProperties()` method.

If you have deployed multiple routers follow the same procedure but the services will be `dispatch-a.myproject.svc` and `dispatch-b.myproject.svc`.