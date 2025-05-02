-- MySQL dump 10.13  Distrib 8.0.19, for Win64 (x86_64)
--
-- Host: localhost    Database: aidetector_db
-- ------------------------------------------------------
-- Server version	11.7.2-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `alembic_version`
--

DROP TABLE IF EXISTS `alembic_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alembic_version`
--

LOCK TABLES `alembic_version` WRITE;
/*!40000 ALTER TABLE `alembic_version` DISABLE KEYS */;
INSERT INTO `alembic_version` VALUES ('24c32e79c1ef');
/*!40000 ALTER TABLE `alembic_version` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_alarm`
--

DROP TABLE IF EXISTS `tbl_alarm`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_alarm` (
  `alarm_id` int(11) NOT NULL AUTO_INCREMENT,
  `alarm_name` varchar(100) NOT NULL,
  `equip_id` int(11) NOT NULL,
  `alarm_type` varchar(100) DEFAULT NULL,
  `alarm_grade` varchar(100) DEFAULT NULL,
  `is_valid` varchar(100) DEFAULT NULL,
  `alarm_message` varchar(100) DEFAULT NULL,
  `occur_date` datetime NOT NULL,
  `recover_date` datetime DEFAULT NULL,
  `delay_minute` int(11) DEFAULT NULL,
  `guksa_id` int(11) DEFAULT 5,
  PRIMARY KEY (`alarm_id`),
  KEY `equip_id` (`equip_id`),
  CONSTRAINT `tbl_alarm_ibfk_1` FOREIGN KEY (`equip_id`) REFERENCES `tbl_equipment` (`equip_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_alarm`
--

LOCK TABLES `tbl_alarm` WRITE;
/*!40000 ALTER TABLE `tbl_alarm` DISABLE KEYS */;
INSERT INTO `tbl_alarm` VALUES (1,'국사2',1,'Trap','Major','무효','장애 메시지 1','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(2,'국사3',2,'Syslog','Major','유효','장애 메시지 2','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(3,'국사4',3,'Trap','Critical','무효','장애 메시지 3','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(4,'국사5',4,'Syslog','Major','유효','장애 메시지 4','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(5,'국사6',5,'Trap','Major','무효','장애 메시지 5','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(6,'국사7',6,'Syslog','Critical','유효','장애 메시지 6','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(7,'국사8',7,'Trap','Major','무효','장애 메시지 7','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(8,'국사9',8,'Syslog','Major','유효','장애 메시지 8','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(9,'국사10',9,'Trap','Critical','무효','장애 메시지 9','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5),(10,'국사1',10,'Syslog','Major','유효','장애 메시지 10','2025-04-08 21:38:20','2025-04-08 21:58:30',20,5);
/*!40000 ALTER TABLE `tbl_alarm` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_equipment`
--

DROP TABLE IF EXISTS `tbl_equipment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_equipment` (
  `equip_id` int(11) NOT NULL AUTO_INCREMENT,
  `equip_name` varchar(100) NOT NULL,
  `equip_field` varchar(100) NOT NULL,
  `equip_type` varchar(100) NOT NULL,
  `equip_model` varchar(100) DEFAULT NULL,
  `equip_details` varchar(100) DEFAULT NULL,
  `guksa_id` int(11) NOT NULL,
  `operation_depart` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`equip_id`),
  KEY `kuksa_id` (`guksa_id`),
  CONSTRAINT `tbl_equipment_ibfk_1` FOREIGN KEY (`guksa_id`) REFERENCES `tbl_guksa` (`guksa_id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_equipment`
--

LOCK TABLES `tbl_equipment` WRITE;
/*!40000 ALTER TABLE `tbl_equipment` DISABLE KEYS */;
INSERT INTO `tbl_equipment` VALUES (1,'M/W-MSPP-1','M/W','MSPP','Model-1','세부유형',3,'운영센터'),(2,'M/W-MSPP-2','M/W','MSPP','Model-2','세부유형',4,'운영센터'),(3,'M/W-MSPP-3','M/W','MSPP','Model-3','세부유형',5,'운영센터'),(4,'M/W-MSPP-4','M/W','MSPP','Model-4','세부유형',6,'운영센터'),(5,'M/W-MSPP-5','M/W','MSPP','Model-5','세부유형',7,'운영센터'),(6,'전송-OLT-1','전송','OLT','Model-1','세부유형',4,'운영센터'),(7,'전송-OLT-2','전송','OLT','Model-2','세부유형',5,'운영센터'),(8,'전송-OLT-3','전송','OLT','Model-3','세부유형',6,'운영센터'),(9,'전송-OLT-4','전송','OLT','Model-4','세부유형',7,'운영센터'),(10,'전송-OLT-5','전송','OLT','Model-5','세부유형',8,'운영센터'),(11,'IP-AGW-1','IP','AGW','Model-1','세부유형',5,'운영센터'),(12,'IP-AGW-2','IP','AGW','Model-2','세부유형',6,'운영센터'),(13,'IP-AGW-3','IP','AGW','Model-3','세부유형',7,'운영센터'),(14,'IP-AGW-4','IP','AGW','Model-4','세부유형',8,'운영센터'),(15,'IP-AGW-5','IP','AGW','Model-5','세부유형',9,'운영센터'),(16,'교환-AGW-1','교환','AGW','Model-1','세부유형',6,'운영센터'),(17,'교환-AGW-2','교환','AGW','Model-2','세부유형',7,'운영센터'),(18,'교환-AGW-3','교환','AGW','Model-3','세부유형',8,'운영센터'),(19,'교환-AGW-4','교환','AGW','Model-4','세부유형',9,'운영센터'),(20,'교환-AGW-5','교환','AGW','Model-5','세부유형',10,'운영센터'),(21,'전송-DWDM-1','전송','DWDM','Model-1','세부유형',7,'운영센터'),(22,'전송-DWDM-2','전송','DWDM','Model-2','세부유형',8,'운영센터'),(23,'전송-DWDM-3','전송','DWDM','Model-3','세부유형',9,'운영센터'),(24,'전송-DWDM-4','전송','DWDM','Model-4','세부유형',10,'운영센터'),(25,'전송-DWDM-5','전송','DWDM','Model-5','세부유형',1,'운영센터');
/*!40000 ALTER TABLE `tbl_equipment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_guksa`
--

DROP TABLE IF EXISTS `tbl_guksa`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_guksa` (
  `guksa_id` int(11) NOT NULL AUTO_INCREMENT,
  `guksa_name` varchar(100) NOT NULL,
  `guksa_type` varchar(100) DEFAULT NULL,
  `operation_depart` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`guksa_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_guksa`
--

LOCK TABLES `tbl_guksa` WRITE;
/*!40000 ALTER TABLE `tbl_guksa` DISABLE KEYS */;
INSERT INTO `tbl_guksa` VALUES (1,'국사1','육지국사','전남지사'),(2,'국사2','도서국사','전남지사'),(3,'국사3','육지국사','전남지사'),(4,'국사4','도서국사','전남지사'),(5,'국사5','육지국사','전남지사'),(6,'국사6','도서국사','전남지사'),(7,'국사7','육지국사','전남지사'),(8,'국사8','도서국사','전남지사'),(9,'국사9','육지국사','전남지사'),(10,'국사10','도서국사','전남지사');
/*!40000 ALTER TABLE `tbl_guksa` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_link`
--

DROP TABLE IF EXISTS `tbl_link`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_link` (
  `link_id` int(11) NOT NULL AUTO_INCREMENT,
  `link_name` varchar(100) NOT NULL,
  `local_guksa_name` varchar(100) NOT NULL,
  `remote_guksa_name` varchar(100) NOT NULL,
  `local_equip_id` varchar(100) DEFAULT NULL,
  `remote_equip_id` varchar(100) DEFAULT NULL,
  `updown_type` varchar(100) NOT NULL,
  `link_type` varchar(100) NOT NULL,
  `link_number` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`link_id`)
) ENGINE=InnoDB AUTO_INCREMENT=81 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_link`
--

LOCK TABLES `tbl_link` WRITE;
/*!40000 ALTER TABLE `tbl_link` DISABLE KEYS */;
INSERT INTO `tbl_link` VALUES (1,'링크1','국사2','국사1','M/W-1','전송-OLT-1','상위국','M/W','#1'),(2,'링크2','국사3','국사1','한전광-1','전송-OLT-1','상위국','한전광','#2'),(3,'링크3','국사4','국사1','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#3'),(4,'링크4','국사5','국사1','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#4'),(5,'링크5','국사1','국사3','M/W-1','전송-OLT-1','하위국','M/W','#5'),(6,'링크6','국사1','국사4','한전광-1','전송-OLT-1','하위국','한전광','#6'),(7,'링크7','국사1','국사5','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#7'),(8,'링크8','국사1','국사6','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#8'),(9,'링크9','국사3','국사2','M/W-1','전송-OLT-1','상위국','M/W','#9'),(10,'링크10','국사4','국사2','한전광-1','전송-OLT-1','상위국','한전광','#10'),(11,'링크11','국사5','국사2','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#11'),(12,'링크12','국사6','국사2','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#12'),(13,'링크13','국사2','국사4','M/W-1','전송-OLT-1','하위국','M/W','#13'),(14,'링크14','국사2','국사5','한전광-1','전송-OLT-1','하위국','한전광','#14'),(15,'링크15','국사2','국사6','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#15'),(16,'링크16','국사2','국사7','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#16'),(17,'링크17','국사4','국사3','M/W-1','전송-OLT-1','상위국','M/W','#17'),(18,'링크18','국사5','국사3','한전광-1','전송-OLT-1','상위국','한전광','#18'),(19,'링크19','국사6','국사3','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#19'),(20,'링크20','국사7','국사3','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#20'),(21,'링크21','국사3','국사5','M/W-1','전송-OLT-1','하위국','M/W','#21'),(22,'링크22','국사3','국사6','한전광-1','전송-OLT-1','하위국','한전광','#22'),(23,'링크23','국사3','국사7','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#23'),(24,'링크24','국사3','국사8','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#24'),(25,'링크25','국사5','국사4','M/W-1','전송-OLT-1','상위국','M/W','#25'),(26,'링크26','국사6','국사4','한전광-1','전송-OLT-1','상위국','한전광','#26'),(27,'링크27','국사7','국사4','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#27'),(28,'링크28','국사8','국사4','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#28'),(29,'링크29','국사4','국사6','M/W-1','전송-OLT-1','하위국','M/W','#29'),(30,'링크30','국사4','국사7','한전광-1','전송-OLT-1','하위국','한전광','#30'),(31,'링크31','국사4','국사8','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#31'),(32,'링크32','국사4','국사9','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#32'),(33,'링크33','국사6','국사5','M/W-1','전송-OLT-1','상위국','M/W','#33'),(34,'링크34','국사7','국사5','한전광-1','전송-OLT-1','상위국','한전광','#34'),(35,'링크35','국사8','국사5','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#35'),(36,'링크36','국사9','국사5','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#36'),(37,'링크37','국사5','국사7','M/W-1','전송-OLT-1','하위국','M/W','#37'),(38,'링크38','국사5','국사8','한전광-1','전송-OLT-1','하위국','한전광','#38'),(39,'링크39','국사5','국사9','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#39'),(40,'링크40','국사5','국사10','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#40'),(41,'링크41','국사7','국사6','M/W-1','전송-OLT-1','상위국','M/W','#41'),(42,'링크42','국사8','국사6','한전광-1','전송-OLT-1','상위국','한전광','#42'),(43,'링크43','국사9','국사6','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#43'),(44,'링크44','국사10','국사6','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#44'),(45,'링크45','국사6','국사8','M/W-1','전송-OLT-1','하위국','M/W','#45'),(46,'링크46','국사6','국사9','한전광-1','전송-OLT-1','하위국','한전광','#46'),(47,'링크47','국사6','국사10','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#47'),(48,'링크48','국사6','국사1','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#48'),(49,'링크49','국사8','국사7','M/W-1','전송-OLT-1','상위국','M/W','#49'),(50,'링크50','국사9','국사7','한전광-1','전송-OLT-1','상위국','한전광','#50'),(51,'링크51','국사10','국사7','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#51'),(52,'링크52','국사1','국사7','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#52'),(53,'링크53','국사7','국사9','M/W-1','전송-OLT-1','하위국','M/W','#53'),(54,'링크54','국사7','국사10','한전광-1','전송-OLT-1','하위국','한전광','#54'),(55,'링크55','국사7','국사1','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#55'),(56,'링크56','국사7','국사2','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#56'),(57,'링크57','국사9','국사8','M/W-1','전송-OLT-1','상위국','M/W','#57'),(58,'링크58','국사10','국사8','한전광-1','전송-OLT-1','상위국','한전광','#58'),(59,'링크59','국사1','국사8','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#59'),(60,'링크60','국사2','국사8','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#60'),(61,'링크61','국사8','국사10','M/W-1','전송-OLT-1','하위국','M/W','#61'),(62,'링크62','국사8','국사1','한전광-1','전송-OLT-1','하위국','한전광','#62'),(63,'링크63','국사8','국사2','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#63'),(64,'링크64','국사8','국사3','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#64'),(65,'링크65','국사10','국사9','M/W-1','전송-OLT-1','상위국','M/W','#65'),(66,'링크66','국사1','국사9','한전광-1','전송-OLT-1','상위국','한전광','#66'),(67,'링크67','국사2','국사9','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#67'),(68,'링크68','국사3','국사9','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#68'),(69,'링크69','국사9','국사1','M/W-1','전송-OLT-1','하위국','M/W','#69'),(70,'링크70','국사9','국사2','한전광-1','전송-OLT-1','하위국','한전광','#70'),(71,'링크71','국사9','국사3','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#71'),(72,'링크72','국사9','국사4','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#72'),(73,'링크73','국사1','국사10','M/W-1','전송-OLT-1','상위국','M/W','#73'),(74,'링크74','국사2','국사10','한전광-1','전송-OLT-1','상위국','한전광','#74'),(75,'링크75','국사3','국사10','MSPP-1-1','전송-OLT-1','상위국','MSPP-1','#75'),(76,'링크76','국사4','국사10','MSPP-2-1','전송-OLT-1','상위국','MSPP-2','#76'),(77,'링크77','국사10','국사2','M/W-1','전송-OLT-1','하위국','M/W','#77'),(78,'링크78','국사10','국사3','한전광-1','전송-OLT-1','하위국','한전광','#78'),(79,'링크79','국사10','국사4','MSPP-1-1','전송-OLT-1','하위국','MSPP-1','#79'),(80,'링크80','국사10','국사5','MSPP-2-1','전송-OLT-1','하위국','MSPP-2','#80');
/*!40000 ALTER TABLE `tbl_link` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_snmp_info`
--

DROP TABLE IF EXISTS `tbl_snmp_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_snmp_info` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `guksa_id` int(11) NOT NULL,
  `equip_id` int(11) NOT NULL,
  `equip_name` varchar(100) DEFAULT NULL,
  `equip_type` varchar(100) DEFAULT NULL,
  `snmp_ip` varchar(50) DEFAULT NULL,
  `community` varchar(50) DEFAULT NULL,
  `port` int(11) DEFAULT NULL,
  `oid1` varchar(50) DEFAULT NULL,
  `oid2` varchar(50) DEFAULT NULL,
  `oid3` varchar(50) DEFAULT NULL,
  `result_code` varchar(10) DEFAULT NULL,
  `result_msg` varchar(500) DEFAULT NULL,
  `power` varchar(10) DEFAULT NULL,
  `fading` varchar(10) DEFAULT NULL,
  `get_datetime` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `kuksa_id` (`guksa_id`),
  KEY `equip_id` (`equip_id`),
  CONSTRAINT `tbl_snmp_info_ibfk_1` FOREIGN KEY (`guksa_id`) REFERENCES `tbl_guksa` (`guksa_id`),
  CONSTRAINT `tbl_snmp_info_ibfk_2` FOREIGN KEY (`equip_id`) REFERENCES `tbl_equipment` (`equip_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_snmp_info`
--

LOCK TABLES `tbl_snmp_info` WRITE;
/*!40000 ALTER TABLE `tbl_snmp_info` DISABLE KEYS */;
INSERT INTO `tbl_snmp_info` VALUES (1,1,1,'라우터1','통신장비','192.168.0.1','public',161,'1.3.6.1.2.1.1.1.0','1.3.6.1.2.1.1.5.0','1.3.6.1.2.1.2.2.1.10.1',NULL,NULL,NULL,NULL,NULL),(2,1,2,'스위치1','네트워크장비','192.168.0.2','public',161,'1.3.6.1.2.1.2.2.1.8.1','1.3.6.1.2.1.1.3.0','1.3.6.1.2.1.1.6.0',NULL,NULL,NULL,NULL,NULL),(3,2,3,'방화벽1','보안장비','192.168.10.1','public',161,'1.3.6.1.4.1.9.1.516','1.3.6.1.4.1.9.2.1.57.0','1.3.6.1.2.1.4.3.0',NULL,NULL,NULL,NULL,NULL),(4,3,4,'서버1','관리장비','192.168.20.5','community123',161,'1.3.6.1.2.1.25.3.3.1.2.1','1.3.6.1.2.1.25.1.1.0','1.3.6.1.2.1.25.2.2.0',NULL,NULL,NULL,NULL,NULL),(5,4,5,'AP1','무선장비','192.168.100.1','community123',161,'1.3.6.1.2.1.1.9.1.2.1','1.3.6.1.2.1.1.9.1.3.1','1.3.6.1.2.1.1.9.1.4.1',NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `tbl_snmp_info` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_sub_link`
--

DROP TABLE IF EXISTS `tbl_sub_link`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_sub_link` (
  `sub_link_id` int(11) NOT NULL AUTO_INCREMENT,
  `sub_link_name` varchar(100) NOT NULL,
  `local_guksa_name` varchar(100) NOT NULL,
  `local_equip_id` varchar(100) DEFAULT NULL,
  `remote_equip_id` varchar(100) DEFAULT NULL,
  `link_id` varchar(100) NOT NULL,
  PRIMARY KEY (`sub_link_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_sub_link`
--

LOCK TABLES `tbl_sub_link` WRITE;
/*!40000 ALTER TABLE `tbl_sub_link` DISABLE KEYS */;
INSERT INTO `tbl_sub_link` VALUES (1,'서브링크-1','국사1','1','2','1'),(2,'서브링크-2','국사1','2','3','1'),(3,'서브링크-3','국사1','3','4','1'),(4,'서브링크-4','국사1','4','5','1'),(5,'서브링크-5','국사1','5','6','1');
/*!40000 ALTER TABLE `tbl_sub_link` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_transmit_dr_cable_alarm_info`
--

DROP TABLE IF EXISTS `tbl_transmit_dr_cable_alarm_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbl_transmit_dr_cable_alarm_info` (
  `guksa_id` varchar(3) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `selection` varchar(1) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `situation_propaganda` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `work_yn` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `merge_yn` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `tt_no` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `bonbu_name` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `center_name` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `buseo_name` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `op_team_name_1` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `op_team_name_2` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `guksa_name` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `tt_occur_datetime` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `alarm_occur_datetime` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `alarm_recover_datetime` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `continue_time` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `effected_facility` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `customer_count` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `voc_count` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `cable_name_core` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `fault_sector` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `sector_analysis` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `status` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `fault_grade` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  `insert_datetime` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_bin NOT NULL DEFAULT '',
  PRIMARY KEY (`tt_no`) USING BTREE
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_transmit_dr_cable_alarm_info`
--

LOCK TABLES `tbl_transmit_dr_cable_alarm_info` WRITE;
/*!40000 ALTER TABLE `tbl_transmit_dr_cable_alarm_info` DISABLE KEYS */;
INSERT INTO `tbl_transmit_dr_cable_alarm_info` VALUES ('K01','Y','전파','Y','N','TT2025042201','호남본부','광주센터','전산부','운영1팀','장애팀','광주서구국사','2025-04-22 08:00:00','2025-04-22 08:10:00','','30분','백본장비 OLT','102','3','지하로 광케이블 144C','광산구 도산동','장비연동불가','복구완료','B','2025-04-22 12:00:00'),('K02','N','정상','N','Y','TT2025042202','수도본부','서울센터','기술부','운영2팀','품질팀','강남국사','2025-04-21 17:50:00','2025-04-21 18:00:00','','60분','고객단말장비','20','1','광케이블 24C','강남구 역삼동','타사 전용선 영향','복구완료','C','2025-04-22 12:01:00'),('K03','Y','전파','Y','N','TT2025042203','중부본부','대전센터','운영부','운영3팀','응답팀','대전국사','2025-04-20 09:00:00','2025-04-20 09:15:00','2025-04-20 10:00:00','45분','중계기','54','0','맨홀 노출선','대전 서구 둔산동','케이블 접속 불량','복구완료','B','2025-04-22 12:02:00'),('K04','N','정상','N','N','TT2025042204','경남본부','부산센터','기획부','네트워크팀','신규팀','부산남국사','2025-04-19 14:20:00','2025-04-19 14:25:00','2025-04-19 15:00:00','35분','고객장비','10','0','단말 광케이블 12C','부산 남구 대연동','고객 단자함 손상','복구완료','C','2025-04-22 12:03:00'),('K05','Y','전파','Y','Y','TT2025042205','영남본부','구미센터','운영부','품질팀','통신팀','구미국사','2025-04-18 11:30:00','2025-04-18 11:35:00','2025-04-18 12:00:00','25분','중심 광링크','200','5','주간로 지하통로 288C','구미시 공단동','외부 공사로 인한 단선','복구완료','A','2025-04-22 12:04:00'),('K06','Y','전파','N','N','TT2025042206','수도본부','인천센터','기술부','장애팀','구축팀','인천서구국사','2025-04-17 08:00:00','2025-04-17 08:05:00','2025-04-17 08:45:00','40분','지사 내부 장비','5','0','노드 연결선 48C','인천 서구 가좌동','지사 전원 문제','복구완료','B','2025-04-22 12:05:00'),('K07','N','정상','Y','N','TT2025042207','충청본부','청주센터','운영부','네트워크팀','신규팀','청주국사','2025-04-16 16:00:00','2025-04-16 16:10:00','2025-04-16 17:00:00','50분','광회선 스플리터','32','2','스플리터 단선 96C','청주시 흥덕구','지하 침수로 인한 장애','복구완료','B','2025-04-22 12:06:00'),('K08','Y','전파','Y','Y','TT2025042208','강원본부','원주센터','운영부','응답팀','운영팀','원주국사','2025-04-15 07:00:00','2025-04-15 07:05:00','2025-04-15 07:30:00','25분','국사 광전송장비','80','4','지하 광케이블 72C','원주시 무실동','전송장비 연동 오류','복구완료','A','2025-04-22 12:07:00'),('K09','N','정상','N','Y','TT2025042209','호남본부','목포센터','장비부','운영4팀','신규팀','목포국사','2025-04-14 10:00:00','2025-04-14 10:10:00','2025-04-14 11:00:00','50분','단자함 연결','16','0','광함 36C','목포시 산정동','케이블 커넥터 이탈','복구완료','C','2025-04-22 12:08:00'),('K10','Y','전파','Y','N','TT2025042210','경기본부','수원센터','기술부','운영5팀','품질팀','수원국사','2025-04-13 06:50:00','2025-04-13 07:00:00','2025-04-13 08:00:00','60분','백본회선','350','10','외곽 지중 576C','수원시 권선구','주변 공사 진동 영향','복구완료','A','2025-04-22 12:09:00');
/*!40000 ALTER TABLE `tbl_transmit_dr_cable_alarm_info` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'aidetector_db'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-04-28 12:55:54
