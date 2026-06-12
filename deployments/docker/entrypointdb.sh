#!/bin/bash -e

if [ "${IS_VAULT_INTEGRATED}" = "false" ]; then
    echo "IS_VAULT_INTEGRATED is set to false. Starting application without connecting to Vault."
    # Exec replaces the shell so execution does not resume
    exec "$@"
fi

# The vault integrations take a backoff and retry approach to failed vault calls.
# 10 retries will be made, with the backoff time increasing by 5 seconds on each retry.
# Almost 5 minutes can be spent trying to connect to vault.
DATA_PATH=.data.data
UI_ENV_VAR_CONFIG="ui_env_vars.txt"

# For information on authenticating with Vault when hosting within AWS, please refer to:
# https://mmcglobal.sharepoint.com/sites/OpenSourceStack/SitePages/Cn.aspx
if [ "${VAULT_USE_AWS_AUTH}" = "true" ]; then
    echo "VAULT_USE_AWS_AUTH is set to $VAULT_USE_AWS_AUTH. Authentication with Vault will use AWS auth."
    echo "Validating that the required environment variables have been set..."
    REQUIRED_ENV_VARS=("AWS_ROLE_ARN" "VAULT_AWS_AUTH_BACKEND" "VAULT_AWS_REGION" "VAULT_ADDR" "VAULT_NAMESPACE" "AWS_WEB_IDENTITY_TOKEN_FILE")
    for var in "${REQUIRED_ENV_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            echo "WARNING: $var has not been set."
        else
            echo "$var has been set with a value of: ${!var}"
        fi
    done
 
    echo "Attempting to retrieve Vault token using AWS auth..."
    VAULT_TOKEN="$(mpc vault perform-aws-auth)"

    echo "Succesfully retrieved Vault token using AWS auth."

    # Remove variables that are no longer needed.
    unset AWS_ACCESS_KEY_ID
    unset AWS_SECRET_ACCESS_KEY
    unset AWS_SESSION_TOKEN
else
    # Retrieve the service account's token to be used for requesting a vault auth token.
    JWT=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)

    echo "Attempting to retrieve Vault token using Kubernetes auth..."

    retry_count=0
    while [ "$STATUS_CODE" != "200" ]
    do
        retry_count=$((retry_count+1))
        echo "Attempt number: $retry_count"
        backoff_time=$((5*retry_count))
        echo "Backoff time if request fails: $backoff_time"
        echo "Vault role name: $VAULT_ROLE_NAME"
        echo "Vault url: $VAULT_URL"
        echo "Vault namespace: $VAULT_NAMESPACE"
        # Make the request to vault to get the auth token.
        STATUS_CODE=$(curl --silent --show-error \
        --output response.txt --write-out "%{http_code}" \
        --location --request POST "$VAULT_URL" \
        --header "X-Vault-Namespace: ${VAULT_NAMESPACE}" \
        --header 'Content-Type: application/json' \
        --data-raw '{
            "role": "'"$VAULT_ROLE_NAME"'",
            "jwt": "'"$JWT"'"
        }')
        ## Going to retry 10 times
        if [ $retry_count -eq 10 ]; then
            >&2 echo "Failed to retrieve Vault token: $(cat response.txt)"
            exit 1
        elif [ "$STATUS_CODE" != "200" ]; then
            >&1 echo "Attempt $retry_count: failed to retrieve Vault token: $(cat response.txt) - retrying in $backoff_time seconds"
        fi
        sleep $backoff_time
    done

    VAULT_TOKEN=$(<response.txt jq -r '.auth.client_token')

    echo "Succesfully retrieved Vault token using Kubernetes auth."

    rm response.txt
    STATUS_CODE=""
fi

echo "Retrieving secrets from vault using auth token ..."
retry_count=0
while [ "$STATUS_CODE" != "200" ]
do
    retry_count=$((retry_count+1))
    echo "Attempt number: $retry_count"
    backoff_time=$((5*retry_count))
    echo "Backoff time if request fails: $backoff_time"

    # Make the request to vault to get the secrets.
    STATUS_CODE=$(curl --silent --show-error \
    --output response.txt --write-out "%{http_code}" \
    --location --request GET "$SECRETS_URL" \
    --header "X-Vault-Namespace: ${VAULT_NAMESPACE}" \
    --header "X-Vault-Token: ${VAULT_TOKEN}")

    ## Going to retry 10 times
    if [ $retry_count -eq 10 ]; then
        >&2 echo "Failed to retrieve secrets: $(cat response.txt)"
        exit 1
    elif [ "$STATUS_CODE" != "200" ]; then
        >&1 echo "Attempt $retry_count: failed to retrieve secrets: $(cat response.txt) - retrying in $backoff_time seconds"
    fi
    sleep $backoff_time
done
echo "Begin processing keys"
# Extract all the secrets from Vault and export as env vars.
# `|| true` allows this to succeed if grep finds nothing.
echo "Checking for keys using ${DATA_PATH} path"
keys=$(<response.txt jq -r "${DATA_PATH}//empty | to_entries | .[].key")
if [ "${keys}" = "" ];
then
    echo "Nothing found at ${DATA_PATH} using .data path instead"
    DATA_PATH=.data
    keys=$(<response.txt jq -r "${DATA_PATH}//empty | to_entries | .[].key")
fi
echo "keys: $keys"
for key in $keys; do
    key=${key//$'\r'}
    value=$(<response.txt jq -r "${DATA_PATH}.${key}")
    firstChars=${value:0:4}
    echo "process $key from vault $firstChars"
    export "$key"="$value"
done
echo "Done processing keys"
rm response.txt

#Function to update Vault with new Mongo Atlas Creds
    update_vault() {
        localCreds="$1"  # First argument
        retry_count=0
        echo "Current STATUS_CODE: $STATUS_CODE"
        STATUS_CODE=""
        while [ "$STATUS_CODE" != "200" ]
        do
            retry_count=$((retry_count+1))
            echo "Attempt number: $retry_count"
            backoff_time=$((5*retry_count))
            echo "Backoff time if request fails: $backoff_time"
            NEW_SECRET_DATA="{\"data\":{\"$VAULT_NAMESPACE\":\"$localCreds\"}}"
            # Make the request to vault to get the secrets.
            STATUS_CODE=$(curl --silent --show-error \
            --output response1.txt --write-out "%{http_code}" \
            --location --request PATCH "$SECRETS_URL_MONGO" \
            --header "X-Vault-Namespace: ${VAULT_NAMESPACE_DEVOPSCOE}" \
            --header "X-Vault-Token: ${VAULT_TOKEN_DB}" \
            --header "Content-Type: application/merge-patch+json" \
            --data-raw "$NEW_SECRET_DATA")

            ## Going to retry 10 times
            if [ $retry_count -eq 10 ]; then
                >&2 echo "Failed to update secrets: $(cat response1.txt)"
                exit 1
            elif [ "$STATUS_CODE" != "200" ]; then
                >&1 echo "Attempt $retry_count: failed to update secrets: $(cat response1.txt) - retrying in $backoff_time seconds"
            fi
            sleep $backoff_time
        done
    }

#Function to update Migrations.json
    update_migrations_json() {
        MONGO_URI="$1"
        if [ -f /home/node/app/migrations.json ]; then
            echo "Updating migration.json with MongoDB URI..."
            jq --arg uri "$MONGO_URI" '.uri = $uri' /home/node/app/migrations.json > /home/node/app/migrations.tmp.json && mv /home/node/app/migrations.tmp.json /home/node/app/migrations.json
        else
            echo "migrations.json not found!"
        fi
    }

#Function to generate dynamic Mongo credentials
    generate_mongoatlas_creds() {
        echo "Generating dynamic Mongo credentials"
        echo "Current STATUS_CODE: $STATUS_CODE"
        STATUS_CODE=""
        retry_count=0
        while [ "$STATUS_CODE" != "200" ]
        do
            retry_count=$((retry_count+1))
            echo "Attempt number: $retry_count"
            backoff_time=$((5*retry_count))
            echo "Backoff time if request fails: $backoff_time"
            echo "Vault Role:$MONGODB_ATLAS_VAULT_ROLE"
            REQUEST_URL="$VAULT_DB_URL/$MONGODB_ATLAS_VAULT_ROLE"
            REQUEST_URL_ROTATE="$VAULT_DB_URL/$MONGODB_ATLAS_VAULT_ROLE/rotate"
            echo "Requesting URL: $REQUEST_URL_ROTATE"
            # Make the request to vault to rotate the secrets.
            STATUS_CODE=$(curl --silent --show-error \
            --output response.txt --write-out "%{http_code}" \
            --location --request GET "$REQUEST_URL_ROTATE" \
            --header "X-Vault-Namespace: ${VAULT_NAMESPACE}" \
            --header "X-Vault-Token: ${VAULT_TOKEN}")
            echo "Mongo Creds rotate STATUS_CODE: $STATUS_CODE"

            # Make the request to vault to get the secrets.
            echo "Requesting URL: $REQUEST_URL"
            STATUS_CODE=$(curl --silent --show-error \
            --output response.txt --write-out "%{http_code}" \
            --location --request GET "$REQUEST_URL" \
            --header "X-Vault-Namespace: ${VAULT_NAMESPACE}" \
            --header "X-Vault-Token: ${VAULT_TOKEN}")
            echo "Mongo Creds STATUS_CODE: $STATUS_CODE"

            ## Going to retry 10 times
            if [ $retry_count -eq 10 ]; then
                >&2 echo "Failed to retrieve secrets: $(cat response.txt)"
                exit 1
            elif [ "$STATUS_CODE" != "200" ]; then
                >&1 echo "Attempt $retry_count: failed to retrieve secrets: $(cat response.txt) - retrying in $backoff_time seconds"
            fi
            sleep $backoff_time
        done
        echo "Begin processing Response for mongo Creds generation"
        echo "Checking for keys using ${DATA_PATH} path"
        username=$(<response.txt jq -r "${DATA_PATH}.username")
        password=$(<response.txt jq -r "${DATA_PATH}.password")
        generatedCreds=$username:$password@
        echo "Done processing for Mongo Response"
        rm response.txt
    }
    
#Function to fetch existing dynamic credentials from Vault
    fetch_from_vault() {
        SECRETS_URL_MONGO="https://mgti-dal-so-vlt.mrshmc.com/v1/kv/data/mongoAtlasSecrets-dbcicd"
    		VAULT_NAMESPACE_DEVOPSCOE='mrsh-devops-credentials'
    		echo "Current STATUS_CODE: $STATUS_CODE"
    		STATUS_CODE=""
    		retry_count=0
    		while [ "$STATUS_CODE" != "200" ]
    		do
    			retry_count=$((retry_count+1))
    			echo "Attempt number: $retry_count"
    			backoff_time=$((5*retry_count))
    			echo "Backoff time if request fails: $backoff_time"
    			echo "Requesting URL: $SECRETS_URL_MONGO"
    			# Make the request to vault to get the secrets.
    			STATUS_CODE=$(curl --silent --show-error \
    			--output response.txt --write-out "%{http_code}" \
    			--location --request GET "$SECRETS_URL_MONGO" \
    			--header "X-Vault-Namespace: ${VAULT_NAMESPACE_DEVOPSCOE}" \
    			--header "X-Vault-Token: ${VAULT_TOKEN_DB}")
    			echo "Mongo Creds STATUS_CODE: $STATUS_CODE"
    
    			## Going to retry 10 times
    			if [ $retry_count -eq 10 ]; then
    				>&2 echo "Failed to retrieve secrets: $(cat response.txt)"
    				exit 1
    			elif [ "$STATUS_CODE" != "200" ]; then
    				>&1 echo "Attempt $retry_count: failed to retrieve secrets: $(cat response.txt) - retrying in $backoff_time seconds"
    			fi
    			sleep $backoff_time
    		done
    		echo "Process fetching existing creds from Vault"
    		# Read the MONGODB_ATLAS_CREDS from the response file
    		MONGODB_ATLAS_CREDS=$(<response.txt jq -r --arg namespace "$VAULT_NAMESPACE" '.data.data[$namespace]')        
    }
	
#Function to do Atlas work for Dynamic role
    do_dynamic_atlas() {
  		MONGODB_ATLAS_CREDS=""
          echo "Processing for Dynamic role type"
          fetch_from_vault
  		if [ -n "$MONGODB_ATLAS_CREDS" ]; then
  			creds=$MONGODB_ATLAS_CREDS
  			#Form Mongo URI & update migrations.json
  			uri="${API_MONGODB_API_DB_URL}?retryWrites=true&w=majority"
  			MONGO_URI="${uri/mongodb+srv:\/\//mongodb+srv:\/\/$creds}"
  			echo "Mongo Uri updated"
  			update_migrations_json "$MONGO_URI"
            echo "DEPLOY_ENV: $DEPLOY_ENV"
            # Copy files from env_script that contain DEPLOY_ENV in their names to db
            cp env_script/*"$DEPLOY_ENV"* db/
            ls -lrt /home/node/app && ls -lrt /home/node/app/db
            echo "Mongo migrate command: $MONGO_DB_CMD"
  			# Start the app, passing through any parameters that have been supplied.
  			exit_status=0
  			output=$(eval "$MONGO_DB_CMD" 2>&1) || {
  			# If eval fails, capture the exit status
  			exit_status=$?
  			echo "Command failed with exit status: $exit_status"
  			}
  			echo "Output value :: $output"
  			echo "Exit status: $exit_status"
  			# Check the exit status of the eval command
  			if [[ $exit_status -ne 0  && $output == *"DbConnectionError"* ]]; then
  				#If Creds Exist in Vault & Have Expired
  				status="generate"
  				echo "Error: Failed to execute migration commands. Creds expired"
  			fi
  		else
  			status="generate"
  			echo "No creds found in Vault"
  		fi
    }
	

# Mongo related changes 	
if [[ $API_MONGODB_API_DB_URL == *"mongodb.net"* ]]; then
    echo "Changes for MongoDB Atlas"
	status=""
	do_dynamic_atlas
    if [[ $status == "generate" ]]; then
		echo "Get/Generate new credentials"
		echo "Vault role is: $VAULT_ROLE_TYPE"
		# Call the generate function and capture the output
		generatedCreds=""
		generate_mongoatlas_creds
		update_vault "$generatedCreds"
		#Form Mongo URI & update migrations.json
		uri="${API_MONGODB_API_DB_URL}?retryWrites=true&w=majority"
		MONGO_URI="${uri/mongodb+srv:\/\//mongodb+srv:\/\/$generatedCreds}"
		echo "Mongo Uri updated"
		update_migrations_json "$MONGO_URI"
        echo "DEPLOY_ENV: $DEPLOY_ENV"
        # Copy files from env_script that contain DEPLOY_ENV in their names to db
        cp env_script/*"$DEPLOY_ENV"* db/
        ls -lrt /home/node/app && ls -lrt /home/node/app/db
		echo "Mongo migrate command: $MONGO_DB_CMD"
		# Start the app, passing through any parameters that have been supplied.
		eval "$MONGO_DB_CMD"
	fi		
else
    echo "Changes for MongoDB on-prem"
    echo "$API_MONGO_DB_CERTIFICATE" >> MongoCert.pem
    # Path to the MongoDB certificate in the current directory
    CERT_PATH="./MongoCert.pem"
    # Check if the certificate file exists
    if [ ! -f "$CERT_PATH" ]; then
        echo "Error: MongoCert.pem not found at $CERT_PATH"
        exit 1
    fi
    # Construct the MongoDB URI with TLS options
    API_MONGODB_API_DB_URL="${API_MONGODB_API_DB_URL}&tlsCAFile=$CERT_PATH"
	  echo "Mongo Uri updated"
    update_migrations_json "$API_MONGODB_API_DB_URL"
    echo "DEPLOY_ENV: $DEPLOY_ENV"
    # Copy files from env_script that contain DEPLOY_ENV in their names to db
    cp env_script/*"$DEPLOY_ENV"* db/
    ls -lrt /home/node/app && ls -lrt /home/node/app/db
    echo "Mongo migrate command: $MONGO_DB_CMD"
    # Start the app, passing through any parameters that have been supplied.
    eval "$MONGO_DB_CMD" 
fi