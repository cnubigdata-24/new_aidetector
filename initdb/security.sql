
--
-- Table structure for table `key_store`
--

DROP TABLE IF EXISTS `key_store`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `key_store` (
  `key_id` varchar(50) NOT NULL,
  `private_key` varchar(100) NOT NULL,
  PRIMARY KEY (`key_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;


LOCK TABLES `key_store` WRITE;
/*!40000 ALTER TABLE `key_store` DISABLE KEYS */;
INSERT INTO `key_store` VALUES ('AESKey','[[${securityAesKey}]]');
/*!40000 ALTER TABLE `key_store` ENABLE KEYS */;
UNLOCK TABLES;
