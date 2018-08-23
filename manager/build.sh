#!/bin/bash

echo '*********************************'
echo 'Building CloudEvent Flow Manager'
echo '*********************************'
mvn -f ../model/pom.xml clean install ||  exit 1;
mvn clean install || exit 1;

echo '*********************************'
echo 'Building Docker Image'
echo '*********************************'
docker build -t docker.io/streamzi/cef-manager .

echo '*********************************'
echo 'Restarting Pods'
echo '*********************************'
oc delete pods -l service=manager