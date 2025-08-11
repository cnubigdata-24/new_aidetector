def label = "Appdu-${UUID.randomUUID().toString()}"


podTemplate(label: label, serviceAccount: 'tiller', namespace: 'appdu-jenkins', nodeSelector: 'appdu-jenkins=true',
    containers: [
        containerTemplate(name: 'build-tools', image: 'ktis-bastion01.container.ipc.kt.com:5000/alpine/build-tools:latest', ttyEnabled: true, command: 'cat', privileged: true, alwaysPullImage: true),
        containerTemplate(name: 'sparrow', image: 'ktis-bastion01.container.ipc.kt.com:5000/alpine/sparrow_appdu:latest', ttyEnabled: true, command: 'cat', privileged: true, alwaysPullImage: true)
    ],
    volumes: [
        hostPathVolume(hostPath: '/var/run/docker.sock', mountPath: '/var/run/docker.sock'),
        nfsVolume(mountPath: '/home/jenkins', serverAddress: '10.217.67.145', serverPath: '/data/nfs/devops/jenkins-slave-pv', readOnly: false)
        ]
    ) {
    node(label) {

        library 'pipeline-lib'

        try {

            // freshStart 
            if ( params.freshStart ) {
                container('build-tools'){
                    // remove previous working dir
                    print "freshStart... clean working directory ${env.JOB_NAME}"
                    sh 'ls -A1|xargs rm -rf' /* clean up our workspace */
                }
            }


            // Initialize - 변수 설정. properties 파일에서 escape 처리가 필요한 변수만 기록하고 처리함.

            // Namespace - Kubernetes 사용자 작업 namespace 명칭
            def namespace           = "appdu-gptfarm"
            // ProjectName - Git Project Name
            def projectName         = "backend-python"
            // BrankName - Git Branch 선택된 명칭(origin이 제거된 순수 branch 명칭)
            def branchName          = getBranchName(params.branchName)
            // TagName - Git, Docker Image TAG 명칭
            def tagName             = new Date().format("yy.MM.dd.HHmm", TimeZone.getTimeZone('Asia/Seoul')) + "-" + branchName
            // Docker Registry - Docker 이미지 저장 Registry
            def dockerRegistry      = "https://" + "docker-registry.default.svc:5000"
            // Image - Docker 이미지 명칭
            def imageName           = "docker-registry.default.svc:5000/appdu-gptfarm/backend-python"
            // Maven Setting
            def mvnSettings         = "${env.WORKSPACE}/devops/jenkins/settings.xml"

            // Jenkins System Environments
            def jobName             = "${env.JOB_NAME}"
            def workspace           = "${env.WORKSPACE}"


            stage('Get Source') {

                sh """
                    git config --global user.email "jenkins@kt.com"
                    git config --global user.name "jenkins"
                    git config --global credential.helper cache
                    git config --global push.default simple
                """
                git url: "https://git.appdu.kt.co.kr/appdu-gptfarm/backend-python.git",
                    credentialsId: 'appdu-gitlab-kt-credential',
                    branch: "${branchName}"
            }


            stage('Common - preWork') {
                gl_preHandler(namespace: namespace, projectName: projectName, branchName: branchName, tagName: tagName, dockerRegistry: dockerRegistry, imageName: imageName, jobName: jobName, workspace: workspace)
            }



            if (params.sparrowEnable) {
                stage('Sparrow') {
                    container('sparrow') {
                        try {
                            def sparrowProjectKey = namespace + "-" + projectName
                            print "Sparrow Project Name : ${sparrowProjectKey}"
                            gl_SparrowRunMD(sparrowProjectKey, "appdu")
                        } catch (e) {
                            print "Sparrow Error :: " + e.toString()+"**"
                            currentBuild.result = "UNSTABLE"
                        }
                    }
                }
            }


            stage('Build Docker image') {
                container('build-tools') {
                    docker.withRegistry("${dockerRegistry}", 'cluster-registry-credentials') {
                        sh "docker build -t appdu-gptfarm-backend-python:prebuild -f devops/jenkins/Dockerfile-prebuild ."
                        sh "docker build -t ${imageName}:${tagName} -f devops/jenkins/Dockerfile ."

                        sh "docker push ${imageName}:${tagName}"

                        sh "docker tag ${imageName}:${tagName} ${imageName}:latest"
                        sh "docker push ${imageName}:latest"
                    }
                }
            }

            stage( 'Helm lint' ) {
                container('build-tools') {
                    dir('devops/helm/backend-python'){
                        sh """
                        # initial helm
                        # central helm repo can't connect
                        # setting stable repo by local repo
                        helm init --client-only --stable-repo-url "http://127.0.0.1:8879/charts" --skip-refresh
                        helm lint --namespace appdu-gptfarm --tiller-namespace appdu-gptfarm .
                        """
                        
                    }
                }
            }


            stage('Tagging Version') {

                try {
                    
                    withCredentials([
                        [$class: 'UsernamePasswordMultiBinding', credentialsId: 'appdu-gitlab-kt-credential', usernameVariable: 'GIT_USERNAME', passwordVariable: 'GIT_PASSWORD']
                        ]) {
                        sh("git config credential.username ${env.GIT_USERNAME}")
                        sh("git config credential.helper '!echo password=\$GIT_PASSWORD; echo'")
                        sh("GIT_ASKPASS=true git push origin --tags")
                    
                        sh """
                            sed -i "s/^version.*/version: ${tagName}/g" devops/helm/backend-python/values.yaml

                            git commit -am "helm version changed"
                            git tag -a ${tagName} -m "Appdu's Jenkins added it."
                            git push --tags
                        """
                    }
                } finally {
                    sh("git config --unset credential.username")
                    sh("git config --unset credential.helper")
                }
                
            }


            stage('Common - postWork') {
                gl_preHandler(namespace: namespace, projectName: projectName, branchName: branchName, tagName: tagName, dockerRegistry: dockerRegistry, imageName: imageName, jobName: jobName, workspace: workspace)
            }




        } catch(e) {
            container('build-tools'){
                print "Clean up ${env.JOB_NAME} workspace..."
                sh 'ls -A1|xargs rm -rf' /* clean up our workspace */
            }


            currentBuild.result = "FAILED"
            
            print " **Error :: " + e.toString()+"**"
        }
    }
}


String getBranchName(branch) {
    branchTemp=sh returnStdout:true ,script:"""echo "$branch" |sed -E "s#origin/##g" """
    if(branchTemp){
        branchTemp=branchTemp.trim()
    }
    return branchTemp
}
