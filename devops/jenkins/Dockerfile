FROM appdu-gptfarm-backend-python:prebuild

ADD  . ${HOME}
USER root
RUN  chmod -R a+rw ${HOME}

ARG  unitTestEnable=false
RUN  if [ "$unitTestEnable" = "true" ]; then \
          pytest; \
     fi 2>&1

#RUN mkdir -p "/etc/config" && echo "devprdflag=dev" > "/etc/config/env.properties"
RUN sed -i "s|self.send_header('Server', self.version_string())|self.send_header('Server', '*') |g" /usr/local/lib/python3.11/http/server.py

#EXPOSE 8080

CMD ["python","app.py"]
