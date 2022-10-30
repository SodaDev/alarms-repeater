build:
	sam build --beta-features

deploy: build
	sam deploy \
		--stack-name=alarms-repeater \
		--region=eu-west-1 \
		--resolve-s3 \
		--capabilities CAPABILITY_IAM