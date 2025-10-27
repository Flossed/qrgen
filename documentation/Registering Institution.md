#Registering the institution. 

The registration of the an Health institution is requested by a user which is registered as issuer. 
the issuer user can either choose to be Employee of an existing insitution or register a new healtheare institution. 
In case of an existing institution the newly registered issuer, selects the institution in the list of institutions. upon this the request to join a healthcare institution will be sent to the administrator of the institution, it is up to the administrator of the issuer, will need to accept or reject that request. 

In case of a request of te new institution, the new issuer needs to fill in the form to register a new institution. It is up to the System admnistrator needs to decide to register the new institution or not. in order to register the new institution is to assign the issuer which requested the creation as administrator of the institution. And create the instition in the list of institutions with an Institution Name . The Insitution name has the following restrictions:

 "in": {
          "type": "string",
          "title": "Institution Name",
          "description": "Name of the issuing institution. Combined with 'ii' must not exceed 25 characters.",
          "maxLength": 21
        },
        
The system then generates an institution ID. The inistitution ID must comply with : 
"ii": {
     "type": "string",
     "title": "Institution Identification Number",
     "description": "Identification number of the institution issuing the card.",
     "minLength": 4,
     "maxLength": 10
   },

and assigns the the requesting user that requested the creation of the institution as administrator.




