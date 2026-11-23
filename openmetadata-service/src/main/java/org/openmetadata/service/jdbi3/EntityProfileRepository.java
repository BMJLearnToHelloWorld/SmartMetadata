package org.openmetadata.service.jdbi3;

import static org.openmetadata.service.jdbi3.TimeSeriesDAOs.ProfilerDataTimeSeriesDAO.SYSTEM_PROFILE_EXTENSION;
import static org.openmetadata.service.jdbi3.TimeSeriesDAOs.ProfilerDataTimeSeriesDAO.TABLE_COLUMN_PROFILE_EXTENSION;
import static org.openmetadata.service.jdbi3.TimeSeriesDAOs.ProfilerDataTimeSeriesDAO.TABLE_PROFILE_EXTENSION;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Map;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.api.data.CreateEntityProfile;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.type.Column;
import org.openmetadata.schema.type.ColumnProfile;
import org.openmetadata.schema.type.EntityProfile;
import org.openmetadata.schema.type.SystemProfile;
import org.openmetadata.schema.type.TableProfile;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.schema.utils.ResultList;
import org.openmetadata.service.Entity;
import org.openmetadata.service.exception.BadRequestException;
import org.openmetadata.service.resources.entityProfiles.EntityProfileMapper;
import org.openmetadata.service.resources.entityProfiles.EntityProfileResource;
import org.openmetadata.service.security.mask.PIIMasker;
import org.openmetadata.service.util.EntityUtil;
import org.openmetadata.service.util.RestUtil;

public class EntityProfileRepository extends EntityTimeSeriesRepository<EntityProfile> {
  public static final EntityProfileMapper entityProfileMapper = new EntityProfileMapper();

  public EntityProfileRepository() {
    super(
        EntityProfileResource.COLLECTION_PATH,
        Entity.getCollectionDAO().profilerDataTimeSeriesDao(),
        EntityProfile.class,
        Entity.ENTITY_PROFILE);
  }

  public ResultList<EntityProfile> listProfileData(
      ListFilter filter, Long startTs, Long endTs, Boolean authorizePII) {
    List<EntityProfile> entityProfileList;
    entityProfileList =
        JsonUtils.readObjects(
            ((TimeSeriesDAOs.ProfilerDataTimeSeriesDAO) timeSeriesDao)
                .listEntityProfileData(filter, startTs, endTs),
            EntityProfile.class);

    entityProfileList =
        entityProfileList.stream().map(EntityProfileRepository::deserializeProfileData).toList();

    if (!authorizePII) {
      entityProfileList = maskEntityProfiles(entityProfileList);
    }
    return new ResultList<>(
        entityProfileList, startTs.toString(), endTs.toString(), entityProfileList.size());
  }

  public Response addProfileData(
      UriInfo uriInfo, EntityInterface<?> entity, CreateEntityProfile createEntityProfile) {
    RestUtil.validateTimestampMilliseconds(createEntityProfile.getTimestamp());

    EntityProfile entityProfile =
        entityProfileMapper
            .createToEntity(createEntityProfile, null)
            .withEntityReference(entity.getEntityReference());
    String jsonSchema = getJsonSchema(entityProfile.getProfileType());
    String extension = getExtension(entityProfile.getProfileType());

    if (entityProfile.getProfileType().equals(CreateEntityProfile.ProfileTypeEnum.SYSTEM)) {
      insertSystemProfile(entity, extension, entityProfile);
    } else {
      String fqn;
      if (entityProfile.getProfileType().equals(CreateEntityProfile.ProfileTypeEnum.COLUMN)) {
        // we need to store column profile against the column FQN
        EntityProfile converted = deserializeProfileDataOrThrow(entityProfile);
        if (!(converted.getProfileData() instanceof ColumnProfile columnProfile)) {
          throw new BadRequestException(
              "Column profileData could not be converted to ColumnProfile");
        }
        Column column = EntityUtil.getColumn((Table) entity, columnProfile.getName());
        fqn = column.getFullyQualifiedName();
      } else {
        fqn = entity.getFullyQualifiedName();
      }
      timeSeriesDao.insert(fqn, extension, jsonSchema, JsonUtils.pojoToJson(entityProfile));
    }
    return Response.created(uriInfo.getRequestUri()).entity(entityProfile).build();
  }

  public void deleteEntityProfile(ListFilter filter, Long timestamp) {
    ((TimeSeriesDAOs.ProfilerDataTimeSeriesDAO) timeSeriesDao)
        .deleteEntityProfileData(filter, timestamp);
  }

  private void insertSystemProfile(
      EntityInterface<?> entity, String extension, EntityProfile entityProfile) {
    // For system profile, timestamp corresponds to the operation time not the profiling time
    // We need to first check if there is an existing system profile at the same timestamp
    // If yes, we update the existing record
    // If no, we insert a new record
    EntityProfile converted = deserializeProfileDataOrThrow(entityProfile);
    if (!(converted.getProfileData() instanceof SystemProfile systemProfile)) {
      throw new BadRequestException("System profileData could not be converted to SystemProfile");
    }
    String storedSystemProfile =
        timeSeriesDao.getExtensionAtTimestampWithOperation(
            entity.getFullyQualifiedName(),
            extension,
            systemProfile.getTimestamp(),
            systemProfile.getOperation().value());
    timeSeriesDao.storeTimeSeriesWithOperation(
        entity.getFullyQualifiedName(),
        SYSTEM_PROFILE_EXTENSION,
        "systemProfile",
        JsonUtils.pojoToJson(entityProfile),
        systemProfile.getTimestamp(),
        systemProfile.getOperation().value(),
        storedSystemProfile != null);
  }

  public static String getExtension(CreateEntityProfile.ProfileTypeEnum profileTypeEnum) {
    return switch (profileTypeEnum) {
      case CreateEntityProfile.ProfileTypeEnum.TABLE -> TABLE_PROFILE_EXTENSION;
      case CreateEntityProfile.ProfileTypeEnum.COLUMN -> TABLE_COLUMN_PROFILE_EXTENSION;
      case CreateEntityProfile.ProfileTypeEnum.SYSTEM -> SYSTEM_PROFILE_EXTENSION;
    };
  }

  private String getJsonSchema(CreateEntityProfile.ProfileTypeEnum profileTypeEnum) {
    return switch (profileTypeEnum) {
      case CreateEntityProfile.ProfileTypeEnum.TABLE -> "tableProfile";
      case CreateEntityProfile.ProfileTypeEnum.COLUMN -> "columnProfile";
      case CreateEntityProfile.ProfileTypeEnum.SYSTEM -> "systemProfile";
    };
  }

  private List<EntityProfile> maskEntityProfiles(List<EntityProfile> entityProfiles) {
    return entityProfiles.stream().map(this::maskEntityProfile).toList();
  }

  private EntityProfile maskEntityProfile(EntityProfile entityProfile) {
    return switch (entityProfile.getProfileType()) {
      case COLUMN -> {
        String entityFqn = entityProfile.getEntityReference().getFullyQualifiedName();
        // The list pass converts with the lenient deserializer first, so a
        // conformant payload is already a ColumnProfile here; a Map only
        // survives when that conversion failed. Convert authoritatively —
        // never blind-cast — so an unconvertible stored profile fails the
        // list with a clear 400 instead of a 500 ClassCastException.
        EntityProfile converted = deserializeProfileDataOrThrow(entityProfile);
        if (!(converted.getProfileData() instanceof ColumnProfile columnProfile)) {
          throw new BadRequestException(
              "Column profileData could not be converted to ColumnProfile");
        }
        ColumnProfile maskedColumnProfile = PIIMasker.maskColumnProfile(entityFqn, columnProfile);
        yield entityProfile.withProfileData(maskedColumnProfile);
      }
      case TABLE, SYSTEM -> entityProfile;
    };
  }

  /**
   * Authoritative conversion of a profile payload to its typed form.
   *
   * <p>Unlike {@link #deserializeProfileData}, which swallows conversion failures and returns the
   * original entity (leaving a {@code Map} that the next unchecked cast turns into a 500 {@code
   * ClassCastException}), this fails the request with a clear 400 when the payload cannot be
   * converted — an unknown key, a wrong-typed value, a missing {@code profileData} or {@code
   * profileType}. The strict mapper is kept: switching to the lenient mapper would silently drop
   * unknown keys and mask malformed payloads. Named deviation from pin (error surfacing only):
   * pin 500s on malformed payloads, this 400s with a clear message; conformant payloads behave
   * identically.
   */
  static EntityProfile deserializeProfileDataOrThrow(EntityProfile entityProfile) {
    Object profileData = entityProfile.getProfileData();
    if (entityProfile.getProfileType() == null) {
      throw new BadRequestException("profileType is required to convert profileData");
    }
    Class<?> expected =
        switch (entityProfile.getProfileType()) {
          case TABLE -> TableProfile.class;
          case COLUMN -> ColumnProfile.class;
          case SYSTEM -> SystemProfile.class;
        };
    if (profileData == null) {
      throw new BadRequestException(
          String.format("%s profileData is required", entityProfile.getProfileType().value()));
    }
    if (expected.isInstance(profileData)) {
      return entityProfile;
    }
    if (profileData instanceof Map<?, ?> map) {
      try {
        String jsonString = JsonUtils.pojoToJson(map);
        Object convertedProfileData =
            switch (entityProfile.getProfileType()) {
              case TABLE -> JsonUtils.readValue(jsonString, TableProfile.class);
              case COLUMN -> JsonUtils.readValue(jsonString, ColumnProfile.class);
              case SYSTEM -> JsonUtils.readValue(jsonString, SystemProfile.class);
            };
        return entityProfile.withProfileData(convertedProfileData);
      } catch (Exception e) {
        // JsonUtils wraps the Jackson failure in a JsonParsingException whose
        // own message is a constant; the offending-key detail lives on the
        // cause, so surface that instead of a bare "Failed to process JSON".
        String detail = e.getMessage();
        if (e.getCause() != null && e.getCause().getMessage() != null) {
          detail = e.getCause().getMessage();
        }
        throw new BadRequestException(
            String.format(
                "%s profileData could not be converted to %s: %s",
                entityProfile.getProfileType().value(), expected.getSimpleName(), detail),
            e);
      }
    }
    throw new BadRequestException(
        String.format(
            "%s profileData could not be converted to %s: expected an object, found %s",
            entityProfile.getProfileType().value(),
            expected.getSimpleName(),
            profileData.getClass().getSimpleName()));
  }

  public static EntityProfile deserializeProfileData(EntityProfile entityProfile) {
    Object profileData = entityProfile.getProfileData();

    // If profileData is a LinkedHashMap, convert it to the proper type based on profileType
    if (profileData instanceof Map<?, ?> map) {
      try {
        String jsonString = JsonUtils.pojoToJson(map);
        Object convertedProfileData =
            switch (entityProfile.getProfileType()) {
              case TABLE -> JsonUtils.readValue(jsonString, TableProfile.class);
              case COLUMN -> JsonUtils.readValue(jsonString, ColumnProfile.class);
              case SYSTEM -> JsonUtils.readValue(jsonString, SystemProfile.class);
            };
        return entityProfile.withProfileData(convertedProfileData);
      } catch (Exception e) {
        // If conversion fails, return the original entity
        return entityProfile;
      }
    }

    return entityProfile;
  }
}
